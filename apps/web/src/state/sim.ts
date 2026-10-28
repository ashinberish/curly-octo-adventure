// Simulated agent runner. Stands in for the real Claude Agent SDK worker until M3:
// each task plays back a canned script of agent steps, pausing for approval at
// "@perm" lines. Pure functions over plain data so it is easy to test and replace.
import { toolsFor, type Employee, type EmployeeStatus, type Presence, type SkillName, type Task } from '@pixel-office/shared';

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

/** How long the green "done!" state lasts after a task finishes. */
export const DONE_FLASH_MS = 6000;

/** Runner bookkeeping that isn't part of the task itself. */
export interface Run {
  step: number;
  nextAt: number;
}

export interface SimState {
  employees: Employee[];
  tasks: Task[];
  runs: Record<number, Run>;
  presence: Record<string, Presence>;
  flashUntil: Record<string, number>;
}

export type SimEvent =
  | { type: 'toast'; text: string }
  | { type: 'say'; employeeId: string; text: string };

export function createTask(id: number, assigneeId: string, title: string, details: string, skill: SkillName): Task {
  return { id, assigneeId, title, details, skill, status: 'queued', progress: 0, awaiting: null, log: [{ kind: 'sys', text: `Queued: “${title}” [${skill}]` }] };
}

export const activeTask = (tasks: Task[], employeeId: string) =>
  tasks.find(t => t.assigneeId === employeeId && (t.status === 'running' || t.status === 'needs_input'));

export const hasOpenWork = (tasks: Task[], employeeId: string) =>
  tasks.some(t => t.assigneeId === employeeId && t.status !== 'done');

export function employeeStatus(id: string, s: Pick<SimState, 'tasks' | 'presence' | 'flashUntil'>, now: number): EmployeeStatus {
  const t = activeTask(s.tasks, id);
  if (t) return t.status === 'running' ? 'running' : 'needs_input';
  if ((s.flashUntil[id] ?? 0) > now) return 'done';
  return s.presence[id] === 'seated' || s.presence[id] === undefined ? 'idle' : 'away';
}

/** Employees with the skill, least busy first. */
export function suggestAssignees(employees: Employee[], tasks: Task[], skill: SkillName): Employee[] {
  const load = (e: Employee) => tasks.filter(t => t.assigneeId === e.id && t.status !== 'done').length;
  return employees.filter(e => e.skills.includes(skill)).sort((a, b) => load(a) - load(b));
}

/**
 * Advances every employee's work by at most one step. Tasks only start once the
 * employee is seated at their desk; each employee runs one task at a time.
 */
export function stepSimulation(s: SimState, now: number, random: () => number = Math.random): { state: SimState; events: SimEvent[]; changed: boolean } {
  const tasks = s.tasks.slice();
  const runs = { ...s.runs };
  const flashUntil = { ...s.flashUntil };
  const events: SimEvent[] = [];
  let changed = false;
  const update = (t: Task, patch: Partial<Task>, log?: Task['log'][number]) => {
    const i = tasks.indexOf(t);
    tasks[i] = { ...t, ...patch, log: log ? [...t.log, log] : t.log };
    changed = true;
    return tasks[i];
  };

  for (const e of s.employees) {
    if (flashUntil[e.id] !== undefined && flashUntil[e.id] <= now) { delete flashUntil[e.id]; changed = true; }
    const current = activeTask(tasks, e.id);
    if (!current) {
      const next = tasks.find(t => t.assigneeId === e.id && t.status === 'queued');
      if (!next || s.presence[e.id] !== 'seated') continue;
      let t = update(next, { status: 'running' }, { kind: 'sys', text: `▶ Spawning Claude agent as ${e.name} (${e.role})` });
      t = update(t, {}, { kind: 'sys', text: `  skills: ${e.skills.join(', ') || 'none'} · tools: ${toolsFor(e.skills).join(' · ') || 'read-only'}` });
      if (!e.skills.includes(t.skill)) update(t, {}, { kind: 'perm', text: `  ⚠ ${e.name} lacks “${t.skill}”, running with general tools only` });
      runs[t.id] = { step: 0, nextAt: now + 900 };
      continue;
    }
    const run = runs[current.id] ?? { step: 0, nextAt: now };
    if (current.status !== 'running' || now < run.nextAt) continue;
    const script = SCRIPTS[current.skill];
    if (run.step < script.length) {
      const line = script[run.step];
      const step = run.step + 1;
      const progress = step / (script.length + 1);
      if (line.startsWith('@perm ')) {
        const awaiting = line.slice(6);
        update(current, { status: 'needs_input', awaiting, progress }, { kind: 'perm', text: `✋ Permission requested: ${awaiting}` });
        events.push({ type: 'toast', text: `✋ ${e.name} needs your approval` });
      } else {
        update(current, { progress }, { kind: line.startsWith('→') ? 'tool' : 'text', text: line });
      }
      runs[current.id] = { step, nextAt: now + 700 + random() * 1100 };
    } else {
      update(current, { status: 'done', progress: 1 }, { kind: 'done', text: RESULTS[current.skill] });
      delete runs[current.id];
      flashUntil[e.id] = now + DONE_FLASH_MS;
      events.push({ type: 'toast', text: `✓ ${e.name} finished “${current.title}”` });
    }
  }
  return { state: { ...s, tasks, runs, flashUntil }, events, changed };
}

/** Approve or deny the tool call a task is waiting on. A denied call is skipped. */
export function resolvePermission(s: SimState, taskId: number, allow: boolean, now: number): SimState {
  const t = s.tasks.find(t => t.id === taskId);
  const run = s.runs[taskId];
  if (!t || !run || t.status !== 'needs_input') return s;
  const log = allow
    ? { kind: 'done' as const, text: `✔ Approved: ${t.awaiting}` }
    : { kind: 'deny' as const, text: `✘ Denied: ${t.awaiting}, agent will skip it and note it` };
  return {
    ...s,
    tasks: s.tasks.map(x => (x === t ? { ...t, status: 'running', awaiting: null, log: [...t.log, log] } : x)),
    runs: { ...s.runs, [taskId]: { step: allow ? run.step : run.step + 1, nextAt: now + 500 } },
  };
}
