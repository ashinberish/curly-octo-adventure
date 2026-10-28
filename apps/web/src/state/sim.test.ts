import { describe, expect, it } from 'vitest';
import type { Employee } from '@pixel-office/shared';
import { DONE_FLASH_MS, SCRIPTS, createTask, employeeStatus, resolvePermission, stepSimulation, suggestAssignees, type SimState } from './sim.ts';

const look = { hair: '#000000', style: 'short', skin: '#ffffff', shirt: '#ff0000', pants: '#0000ff' } as const;
const ada: Employee = { id: 'ada', name: 'Ada', role: 'Engineer', skills: ['Code'], look, deskId: 'd1' };
const sam: Employee = { id: 'sam', name: 'Sam', role: 'Researcher', skills: ['Research', 'Writing'], look, deskId: 'd2' };

function state(overrides: Partial<SimState> = {}): SimState {
  return { employees: [ada, sam], tasks: [], runs: {}, presence: { ada: 'seated', sam: 'seated' }, flashUntil: {}, ...overrides };
}

/** Steps until `done` holds, advancing the clock past every scheduled step. */
function runUntil(s: SimState, done: (s: SimState) => boolean, start = 0): { s: SimState; now: number; toasts: string[] } {
  let now = start;
  const toasts: string[] = [];
  for (let i = 0; i < 200 && !done(s); i++) {
    now += 2000;
    const r = stepSimulation(s, now, () => 0.5);
    s = r.state;
    r.events.forEach(e => e.type === 'toast' && toasts.push(e.text));
  }
  if (!done(s)) throw new Error('condition never reached');
  return { s, now, toasts };
}

describe('stepSimulation', () => {
  it('runs a task to completion and flashes "done"', () => {
    const { s, now, toasts } = runUntil(state({ tasks: [createTask(1, 'sam', 'Write post', '', 'Writing')] }), s => s.tasks[0].status === 'done');
    const t = s.tasks[0];
    expect(t.progress).toBe(1);
    expect(t.log.at(-1)?.kind).toBe('done');
    expect(t.log.filter(l => l.kind === 'text' || l.kind === 'tool')).toHaveLength(SCRIPTS.Writing.length);
    expect(toasts).toContain('✓ Sam finished “Write post”');
    expect(employeeStatus('sam', s, now)).toBe('done');
    expect(employeeStatus('sam', s, now + DONE_FLASH_MS + 1)).toBe('idle');
  });

  it('waits until the employee is seated before starting', () => {
    let s = state({ presence: { ada: 'away', sam: 'seated' }, tasks: [createTask(1, 'ada', 'Fix bug', '', 'Code')] });
    s = stepSimulation(s, 1000).state;
    expect(s.tasks[0].status).toBe('queued');
    expect(employeeStatus('ada', s, 1000)).toBe('away');
    s = stepSimulation({ ...s, presence: { ...s.presence, ada: 'seated' } }, 2000).state;
    expect(s.tasks[0].status).toBe('running');
  });

  it('runs one task at a time per employee, in order', () => {
    const s0 = state({ tasks: [createTask(1, 'ada', 'First', '', 'Code'), createTask(2, 'ada', 'Second', '', 'Code')] });
    const s1 = stepSimulation(s0, 1000).state;
    expect(s1.tasks.map(t => t.status)).toEqual(['running', 'queued']);
  });

  it('pauses for permission and continues after approval', () => {
    const { s, now } = runUntil(state({ tasks: [createTask(1, 'ada', 'Fix bug', '', 'Code')] }), s => s.tasks[0].status === 'needs_input');
    expect(s.tasks[0].awaiting).toBe('Bash(npm test)');
    expect(employeeStatus('ada', s, now)).toBe('needs_input');
    // Stays paused however long you wait.
    expect(stepSimulation(s, now + 60_000).state.tasks[0].status).toBe('needs_input');

    const approved = resolvePermission(s, 1, true, now);
    expect(approved.tasks[0].status).toBe('running');
    expect(approved.tasks[0].log.at(-1)?.text).toBe('✔ Approved: Bash(npm test)');
    const { s: done } = runUntil(approved, s => s.tasks[0].status === 'done', now);
    expect(done.tasks[0].log.some(l => l.text.includes('48 passed'))).toBe(true);
  });

  it('skips the tool result when permission is denied', () => {
    const { s, now } = runUntil(state({ tasks: [createTask(1, 'ada', 'Fix bug', '', 'Code')] }), s => s.tasks[0].status === 'needs_input');
    const { s: done } = runUntil(resolvePermission(s, 1, false, now), s => s.tasks[0].status === 'done', now);
    expect(done.tasks[0].log.some(l => l.kind === 'deny')).toBe(true);
    expect(done.tasks[0].log.some(l => l.text.includes('48 passed'))).toBe(false);
  });

  it('warns in the log when the assignee lacks the skill', () => {
    const s = stepSimulation(state({ tasks: [createTask(1, 'ada', 'Draw it', '', 'Design')] }), 1000).state;
    expect(s.tasks[0].log.some(l => l.kind === 'perm' && l.text.includes('lacks “Design”'))).toBe(true);
  });

  it('ignores approvals for tasks that are not waiting', () => {
    const s = state({ tasks: [createTask(1, 'ada', 'Fix bug', '', 'Code')] });
    expect(resolvePermission(s, 1, true, 0)).toBe(s);
  });
});

describe('suggestAssignees', () => {
  it('picks people with the skill, least busy first', () => {
    const grace: Employee = { ...sam, id: 'grace', name: 'Grace' };
    const tasks = [createTask(1, 'sam', 'Busy', '', 'Writing')];
    expect(suggestAssignees([ada, sam, grace], tasks, 'Research').map(e => e.id)).toEqual(['grace', 'sam']);
    expect(suggestAssignees([ada, sam], tasks, 'DevOps')).toEqual([]);
  });
});
