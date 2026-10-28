import Anthropic from '@anthropic-ai/sdk';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { LogLine, OfficeSnapshot, Task, TaskFile } from '@pixel-office/shared';
import { createApi, type Api } from '../api.ts';
import { pgliteDb, type Db } from '../db.ts';
import { DESK_IDS } from '../desks.ts';
import { agentsFromEnv, readAgentConfig, type AgentConfig, type CallModel } from './config.ts';
import { cleanPath, toolsForSkills } from './tools.ts';

type Params = Parameters<CallModel>[0];
type Reply = { content: unknown[]; stop_reason: string; stop_details?: unknown; container?: { id: string } };

let pg: Db;
let db: Db;
let api: Api;
let clock: number;
let calls: Params[];
let script: Array<Reply | Error | ((p: Params) => Reply | Promise<Reply>)>;
let config: AgentConfig;

/** A scripted model: each call takes the next reply. */
const fakeModel: CallModel = async params => {
  calls.push(structuredClone(params));
  const next = script.shift();
  if (!next) throw new Error('The test script ran out of replies');
  if (next instanceof Error) throw next;
  const r = typeof next === 'function' ? await next(params) : next;
  return {
    id: `msg_${calls.length}`, type: 'message', role: 'assistant', model: params.model,
    content: r.content, stop_reason: r.stop_reason, stop_sequence: null, stop_details: r.stop_details ?? null,
    container: r.container ? { id: r.container.id, expires_at: '' } : null,
    usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  } as unknown as Anthropic.Beta.BetaMessage;
};

const text = (t: string) => ({ type: 'text', text: t, citations: null });
const toolUse = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input });

function makeApi(overrides: Partial<AgentConfig> = {}) {
  config = { ...readAgentConfig({}), workMs: 60_000, ...overrides };
  api = createApi({ db: async () => db, desks: DESK_IDS, now: () => clock, agents: { enabled: true, config, callModel: fakeModel } });
}

async function call<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const [p, q = ''] = path.split('?');
  return api({ method, path: p, query: new URLSearchParams(q), body }) as Promise<{ status: number; body: T }>;
}
const state = async () => (await call<OfficeSnapshot>('GET', '/state')).body;
const task = async (id: number) => (await state()).tasks.find(t => t.id === id)!;
const log = async (id: number) => (await call<{ events: LogLine[] }>('GET', `/tasks/${id}/events`)).body.events.map(l => l.text);
const work = async () => (await call<{ turns: number }>('POST', '/work')).body;
const assign = async (assigneeId: string, title: string, skill = 'Writing') =>
  (await call<Task>('POST', '/tasks', { assigneeId, title, skill, details: 'Keep it short.' })).body;

beforeAll(async () => { pg = await pgliteDb(); });

beforeEach(async () => {
  await pg.query('DROP SCHEMA public CASCADE');
  await pg.query('CREATE SCHEMA public');
  db = { kind: pg.kind, query: pg.query };
  clock = Date.UTC(2026, 9, 28, 12);
  calls = [];
  script = [];
  makeApi();
  await call('GET', '/health'); // migrate + seed
  await pg.query('DELETE FROM tasks'); // start without the demo's queued work
});

describe('Claude agents', () => {
  it('runs a task with tools to completion and saves the deliverable', async () => {
    script = [
      { content: [text('Drafting it now.'), toolUse('tu_1', 'write_file', { path: 'post.md', content: '# Launch\nWe shipped.' })], stop_reason: 'tool_use' },
      { content: [text('I wrote post.md, a short launch post.')], stop_reason: 'end_turn' },
    ];
    const t = await assign('priya', 'Write launch post');
    let s = await state();
    expect(s.tasks.find(x => x.id === t.id)).toMatchObject({ status: 'running', runner: 'claude' });
    expect(s.workPending).toBe(true);
    expect(s.agents).toMatchObject({ mode: 'claude', model: 'claude-opus-5-5', spentTodayUsd: 0 });

    expect(await work()).toMatchObject({ turns: 2 });
    s = await state();
    const done = s.tasks.find(x => x.id === t.id)!;
    expect(done).toMatchObject({ status: 'done', progress: 1, result: 'I wrote post.md, a short launch post.' });
    expect(done.costUsd).toBeCloseTo(2 * (1000 * 4 + 500 * 20) / 1e6);
    expect(s.workPending).toBe(false);
    expect(s.agents.mode === 'claude' && s.agents.spentTodayUsd).toBeCloseTo(done.costUsd);

    const files = (await call<{ files: TaskFile[] }>('GET', `/tasks/${t.id}/files`)).body.files;
    expect(files).toMatchObject([{ path: 'post.md', size: 20 }]);
    expect((await call('GET', `/tasks/${t.id}/files/content?path=post.md`)).body).toEqual({ path: 'post.md', content: '# Launch\nWe shipped.' });
    expect((await call('GET', `/tasks/${t.id}/files/content?path=nope.md`)).status).toBe(404);

    const lines = await log(t.id);
    expect(lines).toContain('Drafting it now.');
    expect(lines).toContain('→ write_file("post.md") — 20 bytes');
    expect(lines.at(-1)).toBe('✓ Done — I wrote post.md, a short launch post.');

    // The request: persona + task, Priya's tools, effort, caching, and the tool result on turn 2.
    const [first, second] = calls;
    expect(first.model).toBe('claude-opus-5-5');
    expect(first.output_config).toEqual({ effort: 'medium' });
    expect(JSON.stringify(first.system)).toContain('You are Priya, the Content Writer');
    expect(first.messages[0].content).toContain('Task: Write launch post');
    expect(first.messages[0].content).toContain('Keep it short.');
    expect(first.tools!.map(x => ('name' in x ? x.name : ''))).toEqual(['web_search', 'web_fetch', 'write_file', 'read_file', 'list_files', 'ask_human']);
    expect(second.messages).toHaveLength(3);
    expect(second.messages[2]).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'Saved post.md.' }] });
  });

  it('pauses on a question and resumes with your answer', async () => {
    script = [
      { content: [toolUse('tu_q', 'ask_human', { question: 'Blue or green?' })], stop_reason: 'tool_use' },
      { content: [text('Went with blue.')], stop_reason: 'end_turn' },
    ];
    const t = await assign('maya', 'Pick a colour', 'Design');
    await state();
    await work();
    expect(await task(t.id)).toMatchObject({ status: 'needs_input', awaiting: 'Blue or green?' });
    expect((await state()).workPending).toBe(false);
    expect(await work()).toMatchObject({ turns: 0 }); // nothing to do while waiting

    expect((await call('POST', `/tasks/${t.id}/permission`, { allow: true, answer: 'Blue' })).status).toBe(200);
    expect((await call('POST', `/tasks/${t.id}/permission`, { allow: true })).status).toBe(409);
    await work();
    expect(await task(t.id)).toMatchObject({ status: 'done', result: 'Went with blue.' });
    expect(calls[1].messages.at(-1)).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_q', content: 'Blue' }] });
    expect(await log(t.id)).toContain('✔ You answered: Blue');
  });

  it('turns a bad tool call into an error result instead of running it', async () => {
    script = [
      { content: [toolUse('tu_1', 'write_file', { path: '../../etc/passwd', content: 'x' })], stop_reason: 'tool_use' },
      { content: [text('Okay.')], stop_reason: 'end_turn' },
    ];
    const t = await assign('priya', 'Try something');
    await state();
    await work();
    const result = (calls[1].messages.at(-1)!.content as Anthropic.Beta.BetaToolResultBlockParam[])[0];
    expect(result).toMatchObject({ tool_use_id: 'tu_1', is_error: true });
    expect((await call<{ files: TaskFile[] }>('GET', `/tasks/${t.id}/files`)).body.files).toEqual([]);
  });

  it('fails the task when Claude declines it', async () => {
    script = [{ content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: '' } }];
    const t = await assign('ada', 'Something', 'Code');
    await state();
    await work();
    expect(await task(t.id)).toMatchObject({ status: 'failed', result: 'Claude declined this task (cyber).' });
  });

  it('resumes paused server-tool turns and keeps the code sandbox container', async () => {
    script = [
      { content: [{ type: 'server_tool_use', id: 'srv_1', name: 'bash_code_execution', input: { command: 'python3 analyze.py' } }], stop_reason: 'pause_turn', container: { id: 'cont_1' } },
      { content: [text('Done.')], stop_reason: 'end_turn', container: { id: 'cont_1' } },
    ];
    const t = await assign('grace', 'Crunch numbers', 'Data');
    await state();
    await work();
    expect(calls[1].container).toBe('cont_1');
    expect(calls[1].messages.at(-1)!.role).toBe('assistant'); // resumed, no extra user message
    expect(await log(t.id)).toContain('→ bash_code_execution(python3 analyze.py)');
    expect(calls[0].tools!.map(x => ('type' in x ? x.type : x.name))).toContain('code_execution_20260120');
  });

  it('stops a run that goes on too long', async () => {
    makeApi({ maxTurns: 2 });
    script = [0, 1].map(() => ({ content: [text('thinking out loud')], stop_reason: 'pause_turn' }));
    const t = await assign('priya', 'Never ends');
    await state();
    expect(await work()).toMatchObject({ turns: 2 });
    expect(await task(t.id)).toMatchObject({ status: 'failed', result: 'Stopped after 2 turns without finishing (AGENT_MAX_TURNS).' });
  });

  it('stops for the day at the budget, and says so once', async () => {
    makeApi({ dailyBudgetUsd: 0 });
    const t = await assign('priya', 'Costly');
    await state();
    expect(await work()).toMatchObject({ turns: 0 });
    clock += 20 * 60_000;
    await work();
    expect((await log(t.id)).filter(l => l.includes('budget'))).toHaveLength(1);
    expect((await state()).workPending).toBe(false);
  });

  it('backs off when the API is busy and retries later', async () => {
    script = [new Anthropic.RateLimitError(429, undefined, 'rate limited', new Headers()), { content: [text('ok')], stop_reason: 'end_turn' }];
    const t = await assign('priya', 'Busy day');
    await state();
    await work();
    expect(await task(t.id)).toMatchObject({ status: 'running' });
    expect((await state()).workPending).toBe(false); // held back for a bit
    clock += 31_000;
    expect((await state()).workPending).toBe(true);
    await work();
    expect(await task(t.id)).toMatchObject({ status: 'done' });
    expect((await log(t.id)).some(l => l.includes('busy (429)'))).toBe(true);
  });

  it('gives up on a run whose turns keep failing', async () => {
    script = [new Error('socket hang up'), new Error('socket hang up'), new Error('socket hang up')];
    const t = await assign('priya', 'Flaky');
    await state();
    for (let i = 0; i < 3; i++) { await work(); clock += 11_000; }
    expect(await task(t.id)).toMatchObject({ status: 'failed', result: 'Gave up after 3 failed turns in a row (unexpected errors).' });
    expect(calls).toHaveLength(3);
  });

  it('drops a turn that finishes after the task was cancelled', async () => {
    let id = 0;
    script = [async () => {
      await call('POST', `/tasks/${id}/cancel`);
      return { content: [text('done anyway')], stop_reason: 'end_turn' };
    }];
    id = (await assign('priya', 'Cancel me')).id;
    await state();
    await work();
    const lines = await log(id);
    expect(lines.at(-1)).toBe('■ Cancelled');
    expect(lines.some(l => l.startsWith('✓ Done'))).toBe(false);
  });

  it('copes with the employee being fired mid-turn', async () => {
    script = [
      async () => { await call('DELETE', '/employees/priya'); return { content: [text('done')], stop_reason: 'end_turn' }; },
      { content: [text('mine')], stop_reason: 'end_turn' },
    ];
    await assign('priya', 'Doomed');
    const other = await assign('sam', 'Survives', 'Research');
    await state();
    const res = await call<{ turns: number }>('POST', '/work');
    expect(res.status).toBe(200);
    expect(res.body.turns).toBe(2);
    expect(await task(other.id)).toMatchObject({ status: 'done' });
  });

  it('lets only one worker play a run at a time', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    script = [async () => { await gate; return { content: [text('one')], stop_reason: 'end_turn' }; }];
    await assign('priya', 'Once');
    await state();
    const first = work();
    await new Promise(r => setTimeout(r, 50));
    expect(await work()).toMatchObject({ turns: 0 }); // the run is leased by the first worker
    release();
    expect(await first).toMatchObject({ turns: 1 });
    expect(calls).toHaveLength(1);
  });
});

describe('agent configuration', () => {
  const makeCaller = () => fakeModel;
  it('needs an API key, and a token on public deployments', () => {
    expect(agentsFromEnv({}, { requireToken: true, makeCaller })).toMatchObject({ enabled: false, reason: expect.stringContaining('ANTHROPIC_API_KEY') });
    expect(agentsFromEnv({ ANTHROPIC_API_KEY: 'k' }, { requireToken: true, makeCaller })).toMatchObject({ enabled: false, reason: expect.stringContaining('OFFICE_TOKEN') });
    expect(agentsFromEnv({ ANTHROPIC_API_KEY: 'k', OFFICE_TOKEN: 't' }, { requireToken: true, makeCaller }).enabled).toBe(true);
    expect(agentsFromEnv({ ANTHROPIC_API_KEY: 'k' }, { requireToken: false, makeCaller }).enabled).toBe(true);
  });

  it('reads limits from the environment with safe defaults', () => {
    expect(readAgentConfig({})).toEqual({ model: 'claude-opus-5-5', effort: 'medium', dailyBudgetUsd: 5, maxTurns: 40, workMs: 120_000 });
    expect(readAgentConfig({ AGENT_MODEL: 'claude-sonnet-5-5', AGENT_EFFORT: 'high', AGENT_DAILY_BUDGET_USD: '1.5', AGENT_MAX_TURNS: 'lots' }))
      .toMatchObject({ model: 'claude-sonnet-5-5', effort: 'high', dailyBudgetUsd: 1.5, maxTurns: 40 });
  });

  it('gives tools by skill', () => {
    const names = (s: Parameters<typeof toolsForSkills>[0]) => toolsForSkills(s).map(t => ('type' in t && t.type ? t.type : t.name));
    expect(names(['Writing'])).toEqual(['write_file', 'read_file', 'list_files', 'ask_human']);
    expect(names(['Research'])).toEqual(['web_search_20260209', 'web_fetch_20260209', 'write_file', 'read_file', 'list_files', 'ask_human']);
    // With the sandbox, the basic web tools (the dynamic ones bring their own code execution).
    expect(names(['Research', 'Data']).slice(0, 3)).toEqual(['web_search_20250305', 'web_fetch_20250910', 'code_execution_20260120']);
  });

  it('keeps workspace paths inside the workspace', () => {
    expect(cleanPath('report.md')).toBe('report.md');
    expect(cleanPath('./src//app.ts')).toBe('src/app.ts');
    for (const bad of ['../x', '/etc/passwd', 'a/../../b', '', 'we<ird>.md', 7]) expect(cleanPath(bad)).toBeNull();
  });
});
