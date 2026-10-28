// One turn of an employee's agent: a model call, then whatever it asked for.
//
// The loop is hand-written rather than the SDK's tool runner because a run is spread over
// many short serverless invocations and can wait days for a human answer: after every turn
// the whole conversation is saved and the next turn may happen in a different process.
// The history is only ever appended to, never edited, so thinking blocks and the prompt
// cache stay valid.
import type Anthropic from '@anthropic-ai/sdk';
import type { SkillName, TaskFile } from '@pixel-office/shared';
import type { NewEvent } from '../sim.ts';
import type { AgentConfig, CallModel } from './config.ts';
import { turnCostUsd } from './pricing.ts';
import { MAX_FILES, toolsForSkills, validateToolInput } from './tools.ts';

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ToolResult = Anthropic.Beta.BetaToolResultBlockParam;

/** What's saved between turns. */
export interface AgentState {
  model: string;
  system: string;
  /** Skills when the run started; the tool set stays fixed for the run. */
  skills: SkillName[];
  conversation: MessageParam[];
  containerId: string | null;
  turns: number;
}

/** A question waiting for the human, plus results of other tools called in the same turn. */
export interface PendingQuestion {
  toolUseId: string;
  question: string;
  otherResults: ToolResult[];
}

export interface Workspace {
  write(path: string, content: string): Promise<void>;
  read(path: string): Promise<string | null>;
  list(): Promise<TaskFile[]>;
}

export interface TurnResult {
  status: 'running' | 'needs_input' | 'done' | 'failed';
  state: AgentState;
  pending: PendingQuestion | null;
  /** Closing summary when done, reason when failed. */
  result: string | null;
  events: NewEvent[];
  costUsd: number;
}

/** Kept moderate so one turn's output fits in MODEL_TIMEOUT_MS; long deliverables are split across files. */
export const MAX_OUTPUT_TOKENS = 16_000;

export function initialState(model: string, system: string, skills: SkillName[], firstMessage: string): AgentState {
  return { model, system, skills, conversation: [{ role: 'user', content: firstMessage }], containerId: null, turns: 0 };
}

export async function runTurn(state: AgentState, deps: { callModel: CallModel; config: AgentConfig; workspace: Workspace; now: () => number }): Promise<TurnResult> {
  const response = await deps.callModel({
    model: state.model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [{ type: 'text', text: state.system, cache_control: { type: 'ephemeral' } }],
    tools: toolsForSkills(state.skills),
    messages: state.conversation,
    cache_control: { type: 'ephemeral' }, // also cache the growing conversation
    output_config: { effort: deps.config.effort },
    ...(state.containerId ? { container: state.containerId } : {}),
  });
  const at = deps.now();
  const turns = state.turns + 1;
  const costUsd = turnCostUsd(response.model || state.model, response.usage);
  const events = describe(response.content, at);
  const containerId = response.container?.id ?? state.containerId;
  const next = (conversation: MessageParam[]): AgentState => ({ ...state, conversation, containerId, turns });
  const assistant: MessageParam = { role: 'assistant', content: response.content };
  const base = { costUsd, pending: null, result: null };

  if (response.stop_reason === 'refusal') {
    // Never run tools from a declined turn, and don't keep its partial output.
    const why = response.stop_details?.category ? ` (${response.stop_details.category})` : '';
    const result = `Claude declined this task${why}.`;
    return { ...base, status: 'failed', state: next(state.conversation), result, events: [...events, { kind: 'deny', text: `✘ ${result}`, at }] };
  }

  const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');

  if (response.stop_reason === 'pause_turn') {
    // A server tool hit its iteration limit; sending the turn back resumes it.
    return { ...base, status: 'running', state: next([...state.conversation, assistant]), events };
  }

  if (response.stop_reason === 'max_tokens') {
    if (toolUses.length) {
      const result = 'The agent ran out of output space in the middle of a tool call.';
      return { ...base, status: 'failed', state: next(state.conversation), result, events: [...events, { kind: 'deny', text: `✘ ${result}`, at }] };
    }
    const nudge: MessageParam = { role: 'user', content: 'You hit the output limit. Continue where you left off.' };
    return { ...base, status: 'running', state: next([...state.conversation, assistant, nudge]), events };
  }

  if (response.stop_reason === 'tool_use' && toolUses.length) {
    const results: ToolResult[] = [];
    let pending: PendingQuestion | null = null;
    for (const use of toolUses) {
      const call = validateToolInput(use.name, use.input);
      if ('error' in call) {
        events.push({ kind: 'deny', text: `  ✘ ${use.name}: ${call.error}`, at });
        results.push({ type: 'tool_result', tool_use_id: use.id, is_error: true, content: JSON.stringify({ error: call.error, received: use.input }) });
        continue;
      }
      if (call.name === 'ask_human') {
        if (pending) {
          results.push({ type: 'tool_result', tool_use_id: use.id, is_error: true, content: 'Ask one question at a time.' });
        } else {
          pending = { toolUseId: use.id, question: call.question, otherResults: [] };
          events.push({ kind: 'perm', text: `✋ Question for you: ${call.question}`, at });
        }
        continue;
      }
      results.push(await runOfficeTool(call, use.id, deps.workspace, events, at));
    }
    const conversation = [...state.conversation, assistant];
    if (pending) {
      pending.otherResults = results;
      return { ...base, status: 'needs_input', pending, state: next(conversation), events };
    }
    return { ...base, status: 'running', state: next([...conversation, { role: 'user', content: results }]), events };
  }

  // end_turn (or anything else that ends the turn without asking for more).
  const summary = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map(b => b.text).join('\n').trim() || 'Done.';
  events.push({ kind: 'done', text: `✓ Done — ${clip(summary, 400)}`, at });
  return { ...base, status: 'done', state: next([...state.conversation, assistant]), result: summary, events };
}

/** The tool_result message that answers a pending question and resumes the run. */
export function answerMessage(pending: PendingQuestion, answer: string): MessageParam {
  return { role: 'user', content: [...pending.otherResults, { type: 'tool_result', tool_use_id: pending.toolUseId, content: answer }] };
}

async function runOfficeTool(call: Exclude<ReturnType<typeof validateToolInput>, { error: string }>, id: string, ws: Workspace, events: NewEvent[], at: number): Promise<ToolResult> {
  const ok = (content: string): ToolResult => ({ type: 'tool_result', tool_use_id: id, content });
  const fail = (content: string): ToolResult => ({ type: 'tool_result', tool_use_id: id, is_error: true, content });
  switch (call.name) {
    case 'write_file': {
      const files = await ws.list();
      if (!files.some(f => f.path === call.path) && files.length >= MAX_FILES) return fail(`The workspace already has ${MAX_FILES} files.`);
      await ws.write(call.path, call.content);
      events.push({ kind: 'tool', text: `→ write_file("${call.path}") — ${Buffer.byteLength(call.content)} bytes`, at });
      return ok(`Saved ${call.path}.`);
    }
    case 'read_file': {
      events.push({ kind: 'tool', text: `→ read_file("${call.path}")`, at });
      const content = await ws.read(call.path);
      return content === null ? fail(`There is no file ${call.path}.`) : ok(content);
    }
    case 'list_files': {
      events.push({ kind: 'tool', text: '→ list_files()', at });
      const files = await ws.list();
      return ok(files.length ? files.map(f => `${f.path} (${f.size} bytes)`).join('\n') : 'The workspace is empty.');
    }
    default:
      return fail('Unexpected tool');
  }
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const firstLine = (s: unknown) => clip(String(s ?? '').trim().split('\n')[0] ?? '', 120);

/** Console lines for a model response: what it said and which tools it used. */
function describe(content: Anthropic.Beta.BetaContentBlock[], at: number): NewEvent[] {
  const out: NewEvent[] = [];
  for (const block of content) {
    // Many block types; read the few fields shown in the console without importing each type.
    const b = block as unknown as { type: string } & Record<string, unknown>;
    const input = (b.input ?? {}) as Record<string, unknown>;
    const result = b.content as Record<string, unknown> | Array<unknown> | undefined;
    switch (b.type) {
      case 'text':
        if (String(b.text).trim()) out.push({ kind: 'text', text: clip(String(b.text).trim(), 1500), at });
        break;
      case 'server_tool_use': {
        const name = String(b.name);
        const arg = name === 'web_search' ? `"${input.query}"` : name === 'web_fetch' ? String(input.url) : name === 'bash_code_execution' ? firstLine(input.command)
          : name === 'text_editor_code_execution' ? `${input.command} ${input.path ?? ''}`.trim() : firstLine(input.code ?? '');
        out.push({ kind: 'tool', text: `→ ${name}(${arg})`, at });
        break;
      }
      case 'tool_use':
        break; // logged as the office tool runs
      case 'web_search_tool_result':
        out.push({ kind: 'sys', text: Array.isArray(result) ? `  ← ${result.length} results` : `  ✘ search failed: ${(result as Record<string, unknown>)?.error_code}`, at });
        break;
      case 'web_fetch_tool_result': {
        const r = result as Record<string, unknown> | undefined;
        out.push({ kind: 'sys', text: r?.type === 'web_fetch_result' ? `  ← fetched ${r.url}` : `  ✘ fetch failed: ${r?.error_code}`, at });
        break;
      }
      case 'bash_code_execution_tool_result':
      case 'code_execution_tool_result': {
        const r = result as Record<string, unknown> | undefined;
        if (r && 'return_code' in r) {
          const stdout = String(r.stdout ?? '').trim();
          out.push({ kind: 'sys', text: `  ← exit ${r.return_code}${stdout ? `: ${clip(stdout.replace(/\s+/g, ' '), 200)}` : ''}`, at });
        } else out.push({ kind: 'sys', text: `  ✘ sandbox error: ${r?.error_code ?? 'unknown'}`, at });
        break;
      }
      case 'fallback': {
        const from = (b.from as { model?: string } | undefined)?.model, to = (b.to as { model?: string } | undefined)?.model;
        out.push({ kind: 'sys', text: `  (${from} declined; ${to} took over)`, at });
        break;
      }
      default:
        break; // thinking, editor results and the rest aren't shown
    }
  }
  return out;
}
