// One real agent run against the Claude API, to check your key, model and request shape
// before deploying. Costs a few cents. Usage (from the repo root):
//   ANTHROPIC_API_KEY=sk-ant-... npm run agent:check
// Honours AGENT_MODEL and AGENT_EFFORT like the app does.
import type { TaskFile } from '@pixel-office/shared';
import { claudeCaller } from '../src/agent/claude.ts';
import { readAgentConfig } from '../src/agent/config.ts';
import { initialState, runTurn, type Workspace } from '../src/agent/turn.ts';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('Set ANTHROPIC_API_KEY first.');
  process.exit(1);
}
const config = readAgentConfig(process.env);
const files = new Map<string, string>();
const workspace: Workspace = {
  write: async (path, content) => { files.set(path, content); },
  read: async path => files.get(path) ?? null,
  list: async (): Promise<TaskFile[]> => [...files].map(([path, c]) => ({ path, size: Buffer.byteLength(c), updatedAt: Date.now() })),
};

// Research + Data asks for every tool type the app uses (web, code sandbox, office tools).
let state = initialState(
  config.model,
  'You are a test agent checking that your tools work. Be brief.',
  ['Research', 'Data'],
  'Use write_file to save a file named check.txt whose entire content is OK. Then reply with one short sentence.',
);
const callModel = claudeCaller(apiKey);
let total = 0;
for (let turn = 1; turn <= 4; turn++) {
  const r = await runTurn(state, { callModel, config, workspace, now: Date.now });
  for (const e of r.events) console.log(`  ${e.text}`);
  total += r.costUsd;
  console.log(`turn ${turn}: ${r.status} (~$${r.costUsd.toFixed(4)})`);
  state = r.state;
  if (r.status !== 'running') break;
}
const ok = files.get('check.txt')?.trim() === 'OK';
console.log(`\n${ok ? '✓' : '✗'} ${config.model}: ${ok ? 'agent saved check.txt' : 'agent did not save check.txt as asked'} · about $${total.toFixed(4)}`);
process.exit(ok ? 0 : 1);
