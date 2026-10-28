// A stand-in model for local dev and browser tests (AGENT_FAKE=1 with `npm run dev`): it
// exercises the real agent loop, tools and UI without calling the Claude API.
// Turn 1 saves a file, turn 2 asks you a question, turn 3 finishes using your answer.
import type Anthropic from '@anthropic-ai/sdk';
import type { CallModel } from './config.ts';

export const fakeModel: CallModel = async params => {
  const msgs = params.messages;
  const task = String(msgs[0]?.content ?? '').split('\n')[0].replace(/^Task: /, '');
  const step = msgs.filter(m => m.role === 'assistant').length;
  const last = msgs.at(-1)?.content;
  const answer = Array.isArray(last) ? last.map(b => ('content' in b && typeof b.content === 'string' ? b.content : '')).join(' ') : '';
  const id = `toolu_fake_${step}`;
  await new Promise(r => setTimeout(r, 1500)); // feel like work
  const reply = (content: unknown[], stop_reason: string): Anthropic.Beta.BetaMessage => ({
    id: `msg_fake_${step}`, type: 'message', role: 'assistant', model: 'fake-model', content, stop_reason, stop_sequence: null,
    stop_details: null, container: null, context_management: null, diagnostics: null,
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  } as unknown as Anthropic.Beta.BetaMessage);
  const text = (t: string) => ({ type: 'text', text: t, citations: null });
  if (step === 0) {
    return reply([text(`Starting on “${task}”. Writing up a plan first.`), {
      type: 'tool_use', id, name: 'write_file',
      input: { path: 'plan.md', content: `# Plan: ${task}\n\n1. Understand the goal\n2. Do the work\n3. Write it up\n` },
    }], 'tool_use');
  }
  if (step === 1) {
    return reply([{ type: 'tool_use', id, name: 'ask_human', input: { question: 'Should I also make a one-page summary? (yes/no)' } }], 'tool_use');
  }
  return reply([text(`Done. I saved plan.md for “${task}”. You said: “${answer.trim()}”.`)], 'end_turn');
};
