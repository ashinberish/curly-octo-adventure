// Simulated agent runner, until the Claude Agent SDK arrives in M3.
//
// There is no background process on Vercel, so the simulation is driven by time:
// each run stores its step and when the next step is due, and whoever polls next
// catches it up to "now". A run left alone for an hour finishes in one go.
// Everything here is pure; office.ts applies the results to the database.
import { toolsFor, type Employee, type LogKind, type SkillName, type TaskStatus } from '@pixel-office/shared';

export const SCRIPTS: Record<SkillName, string[]> = {
  Code: ['Reading repository layout…', '→ Glob("src/**/*.ts")', '→ Read("src/routes/auth.ts")', 'Plan: 1) add middleware 2) wire route 3) test', '→ Edit("src/middleware/rateLimit.ts")', '→ Edit("src/routes/auth.ts")', '@perm Bash(npm test)', '→ Bash("npm test") — 48 passed', 'Writing summary for reviewer…'],
  Research: ['Breaking question into sub-queries…', '→ WebSearch("…")', '→ WebFetch(source 1)', '→ WebFetch(source 2)', 'Cross-checking claims between sources', 'Drafting findings with citations…'],
  Writing: ['Reading brief & tone guide…', 'Outlining 4 sections', '→ Write("draft.md")', 'Tightening copy, checking length', 'Self-review pass…'],
  Design: ['Reviewing brand tokens…', 'Sketching 3 layout options', '→ Write("mockup.html")', 'Rendering preview…', 'Checking contrast & mobile width'],
  Data: ['Inspecting schema…', '→ Read("data/signups.csv")', '@perm Bash(python analyze.py)', '→ Bash("python analyze.py") — 12,408 rows', 'Found +18% WoW spike on Tue', '→ Write("report.md") with 2 charts'],
  QA: ['Mapping untested paths…', '→ Grep("export function")', '→ Write("tests/cart.test.ts")', '@perm Bash(npm test -- cart)', '→ Bash("npm test -- cart") — 1 failing', 'Isolating flaky assertion…', 'Fix + re-run — 9 passed'],
  DevOps: ['Reading CI config…', '→ Read(".github/workflows/ci.yml")', 'Adding cache step for node_modules', '→ Edit(".github/workflows/ci.yml")', '@perm Bash(act -j build)', '→ Bash("act -j build") — 3m12s → 1m40s', 'Preparing PR description…'],
};

export const RESULTS: Record<SkillName, string> = {
  Code: '✓ Done — branch pushed, draft PR opened (simulated)',
  Research: '✓ Done — 1-page brief with 6 citations',
  Writing: '✓ Done — draft.md ready for review',
  Design: '✓ Done — mockup.html with 3 variants',
  Data: '✓ Done — report.md (2 charts, 3 insights)',
  QA: '✓ Done — 9 new tests, 1 flaky test fixed',
  DevOps: '✓ Done — CI 47% faster, PR ready',
};

/** Delay before the first step after a run starts. */
export const START_DELAY_MS = 900;

/** 0.7–1.8s between steps; deterministic so replays and concurrent pollers agree. */
export function stepDelay(taskId: number, step: number): number {
  let h = Math.imul(taskId + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(step + 1, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d);
  h ^= h >>> 15;
  return 700 + ((h >>> 0) % 1100);
}

/** The run state of a task, as stored. */
export interface RunState {
  id: number;
  title: string;
  skill: SkillName;
  status: TaskStatus;
  step: number;
  nextAt: number | null;
}

export interface NewEvent {
  kind: LogKind;
  text: string;
  at: number;
}

export interface RunPatch {
  status: TaskStatus;
  step: number;
  nextAt: number | null;
  progress: number;
  awaiting: string | null;
  startedAt?: number;
  finishedAt?: number;
}

export interface Advance {
  patch: RunPatch;
  events: NewEvent[];
}

const progressAt = (skill: SkillName, step: number) => step / (SCRIPTS[skill].length + 1);

export function startRun(task: RunState, employee: Employee, now: number): Advance {
  const events: NewEvent[] = [
    { kind: 'sys', text: `▶ Spawning Claude agent as ${employee.name} (${employee.role})`, at: now },
    { kind: 'sys', text: `  skills: ${employee.skills.join(', ') || 'none'} · tools: ${toolsFor(employee.skills).join(' · ') || 'read-only'}`, at: now },
  ];
  if (!employee.skills.includes(task.skill)) {
    events.push({ kind: 'perm', text: `  ⚠ ${employee.name} lacks “${task.skill}”, running with general tools only`, at: now });
  }
  return { patch: { status: 'running', step: 0, nextAt: now + START_DELAY_MS, progress: 0, awaiting: null, startedAt: now }, events };
}

/** Plays every step that's due by `now`. Returns null when nothing is due. */
export function catchUp(task: RunState, now: number): Advance | null {
  if (task.status !== 'running' || task.nextAt === null || task.nextAt > now) return null;
  const script = SCRIPTS[task.skill];
  const events: NewEvent[] = [];
  let step = task.step, at = task.nextAt;
  while (at <= now) {
    if (step >= script.length) {
      events.push({ kind: 'done', text: RESULTS[task.skill], at });
      return { patch: { status: 'done', step, nextAt: null, progress: 1, awaiting: null, finishedAt: at }, events };
    }
    const line = script[step];
    step++;
    if (line.startsWith('@perm ')) {
      const awaiting = line.slice('@perm '.length);
      events.push({ kind: 'perm', text: `✋ Permission requested: ${awaiting}`, at });
      return { patch: { status: 'needs_input', step, nextAt: null, progress: progressAt(task.skill, step), awaiting }, events };
    }
    events.push({ kind: line.startsWith('→') ? 'tool' : 'text', text: line, at });
    at += stepDelay(task.id, step);
  }
  return { patch: { status: 'running', step, nextAt: at, progress: progressAt(task.skill, step), awaiting: null }, events };
}

/** Approving continues with the tool call; denying skips the line that shows its result. */
export function resolvePermission(task: RunState & { awaiting: string | null }, allow: boolean, now: number): Advance | null {
  if (task.status !== 'needs_input') return null;
  return {
    patch: { status: 'running', step: allow ? task.step : task.step + 1, nextAt: now + 500, progress: progressAt(task.skill, task.step), awaiting: null },
    events: [allow
      ? { kind: 'done', text: `✔ Approved: ${task.awaiting}`, at: now }
      : { kind: 'deny', text: `✘ Denied: ${task.awaiting}, agent will skip it and note it`, at: now }],
  };
}
