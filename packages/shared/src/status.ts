import type { Employee, EmployeeStatus, Presence, SkillName, Task } from './types.ts';

/** How long someone shows the green "done!" state after finishing a task. */
export const DONE_FLASH_MS = 6000;

export const isOpen = (t: Task) => t.status === 'queued' || t.status === 'running' || t.status === 'needs_input';

export const activeTask = (tasks: readonly Task[], employeeId: string) =>
  tasks.find(t => t.assigneeId === employeeId && (t.status === 'running' || t.status === 'needs_input'));

export const hasOpenWork = (tasks: readonly Task[], employeeId: string) =>
  tasks.some(t => t.assigneeId === employeeId && isOpen(t));

/**
 * What to show for an employee. `presence` comes from the game world (where their
 * body is); `now` must be on the server's clock.
 */
export function employeeStatus(id: string, tasks: readonly Task[], presence: Presence | undefined, now: number): EmployeeStatus {
  const t = activeTask(tasks, id);
  if (t) return t.status === 'running' ? 'running' : 'needs_input';
  const finished = tasks.some(t => t.assigneeId === id && t.status === 'done' && t.finishedAt !== null && now - t.finishedAt < DONE_FLASH_MS);
  if (finished) return 'done';
  return presence === undefined || presence === 'seated' ? 'idle' : 'away';
}

/** Employees with the skill, least busy first. */
export function suggestAssignees(employees: readonly Employee[], tasks: readonly Task[], skill: SkillName): Employee[] {
  const load = (e: Employee) => tasks.filter(t => t.assigneeId === e.id && isOpen(t)).length;
  return employees.filter(e => e.skills.includes(skill)).sort((a, b) => load(a) - load(b));
}
