// Office state in Postgres: employees, tasks and their run logs.
import { suggestAssignees, type Employee, type EmployeePatch, type LogLine, type NewEmployee, type NewTask, type OfficeSnapshot, type SkillName, type Task, type TaskPatch, type TaskStatus } from '@pixel-office/shared';
import type { Db } from './db.ts';
import { HttpError, pgCode } from './errors.ts';
import { catchUp, resolvePermission, startRun, type Advance, type RunState } from './sim.ts';

interface EmployeeRow { id: string; name: string; role: string; skills: string[]; look: Employee['look']; desk_id: string }
interface TaskRow {
  id: number; assignee_id: string; title: string; details: string; skill: string; status: string;
  progress: number; awaiting: string | null; step: number; next_at: number | null; version: number;
  created_at: number; started_at: number | null; finished_at: number | null;
}

const toEmployee = (r: EmployeeRow): Employee =>
  ({ id: r.id, name: r.name, role: r.role, skills: r.skills as SkillName[], look: r.look, deskId: r.desk_id });

const toTask = (r: TaskRow): Task => ({
  id: r.id, assigneeId: r.assignee_id, title: r.title, details: r.details, skill: r.skill as SkillName,
  status: r.status as TaskStatus, progress: r.progress, awaiting: r.awaiting,
  createdAt: r.created_at, startedAt: r.started_at, finishedAt: r.finished_at,
});

const toRun = (r: TaskRow): RunState & { awaiting: string | null } =>
  ({ id: r.id, title: r.title, skill: r.skill as SkillName, status: r.status as TaskStatus, step: r.step, nextAt: r.next_at, awaiting: r.awaiting });

/** Done tasks returned in a snapshot; older ones stay in the database. */
const RECENT_DONE = 40;

export class Office {
  private readonly db: Db;
  private readonly desks: readonly string[];
  private readonly now: () => number;

  constructor(db: Db, desks: readonly string[], now: () => number = Date.now) {
    this.db = db;
    this.desks = desks;
    this.now = now;
  }

  async snapshot(): Promise<OfficeSnapshot> {
    await this.advance();
    const [employees, tasks] = await Promise.all([
      this.db.query<EmployeeRow>(`SELECT * FROM employees ORDER BY created_at, id`),
      this.db.query<TaskRow>(
        `SELECT * FROM tasks WHERE status IN ('queued', 'running', 'needs_input')
           OR id IN (SELECT id FROM tasks WHERE status = 'done' ORDER BY finished_at DESC LIMIT ${RECENT_DONE})
         ORDER BY id`,
      ),
    ]);
    return { serverTime: this.now(), employees: employees.map(toEmployee), tasks: tasks.map(toTask), desks: [...this.desks] };
  }

  /** Plays simulated agent steps that are due and starts queued work for anyone free. */
  async advance(): Promise<void> {
    const now = this.now();
    const open = await this.db.query<TaskRow>(`SELECT * FROM tasks WHERE status IN ('queued', 'running', 'needs_input') ORDER BY id`);
    const busy = new Set<string>();
    for (const t of open) {
      if (t.status === 'needs_input') { busy.add(t.assignee_id); continue; }
      if (t.status !== 'running') continue;
      const adv = catchUp(toRun(t), now);
      // If another request got there first, assume the run is still going.
      const status = adv && (await this.apply(t, adv)) ? adv.patch.status : t.status;
      if (status === 'running' || status === 'needs_input') busy.add(t.assignee_id);
    }
    const queued = open.filter(t => t.status === 'queued' && !busy.has(t.assignee_id));
    if (!queued.length) return;
    const employees = new Map((await this.listEmployees()).map(e => [e.id, e]));
    for (const t of queued) {
      const e = employees.get(t.assignee_id);
      if (!e || busy.has(e.id)) continue;
      busy.add(e.id);
      await this.apply(t, startRun(toRun(t), e, now));
    }
  }

  async events(taskId: number, after: number): Promise<LogLine[]> {
    return this.db.query<LogLine>(
      `SELECT id::float8 AS id, task_id AS "taskId", kind, text, at FROM task_events WHERE task_id = $1 AND id > $2 ORDER BY id LIMIT 500`,
      [taskId, after],
    );
  }

  // ───────────────────────── Employees ─────────────────────────

  async listEmployees(): Promise<Employee[]> {
    return (await this.db.query<EmployeeRow>(`SELECT * FROM employees ORDER BY created_at, id`)).map(toEmployee);
  }

  async hire(input: NewEmployee): Promise<Employee> {
    const taken = new Set((await this.db.query<{ desk_id: string }>(`SELECT desk_id FROM employees`)).map(r => r.desk_id));
    let desk = input.deskId;
    if (desk !== undefined) {
      this.checkDesk(desk);
      if (taken.has(desk)) throw new HttpError(409, `Desk ${desk} is taken`);
    } else {
      desk = this.desks.find(d => !taken.has(d));
      if (!desk) throw new HttpError(409, 'No free desks');
    }
    const id = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'employee'}-${Math.random().toString(36).slice(2, 6)}`;
    const rows = await this.db.query<EmployeeRow>(
      `INSERT INTO employees (id, name, role, skills, look, desk_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (desk_id) DO NOTHING RETURNING *`,
      [id, input.name, input.role, input.skills, JSON.stringify(input.look), desk, this.now()],
    );
    if (!rows.length) throw new HttpError(409, `Desk ${desk} is taken`);
    return toEmployee(rows[0]);
  }

  async updateEmployee(id: string, patch: EmployeePatch): Promise<Employee> {
    if (patch.deskId !== undefined) this.checkDesk(patch.deskId);
    const cols: Record<string, unknown> = {};
    if (patch.name !== undefined) cols.name = patch.name;
    if (patch.role !== undefined) cols.role = patch.role;
    if (patch.skills !== undefined) cols.skills = patch.skills;
    if (patch.look !== undefined) cols.look = JSON.stringify(patch.look);
    if (patch.deskId !== undefined) cols.desk_id = patch.deskId;
    const keys = Object.keys(cols);
    try {
      const rows = await this.db.query<EmployeeRow>(
        `UPDATE employees SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
        [id, ...keys.map(k => cols[k])],
      );
      if (!rows.length) throw new HttpError(404, 'No such employee');
      return toEmployee(rows[0]);
    } catch (e) {
      if (pgCode(e) === '23505') throw new HttpError(409, `Desk ${patch.deskId} is taken`);
      throw e;
    }
  }

  /** Removes the employee and all their tasks. */
  async fire(id: string): Promise<void> {
    const rows = await this.db.query(`DELETE FROM employees WHERE id = $1 RETURNING id`, [id]);
    if (!rows.length) throw new HttpError(404, 'No such employee');
  }

  private checkDesk(desk: string): void {
    if (!this.desks.includes(desk)) throw new HttpError(400, `There is no desk ${desk}`);
  }

  // ───────────────────────── Tasks ─────────────────────────

  async addTask(input: NewTask): Promise<Task> {
    let assignee = input.assigneeId;
    if (assignee === 'auto') {
      const [employees, open] = await Promise.all([
        this.listEmployees(),
        this.db.query<TaskRow>(`SELECT * FROM tasks WHERE status IN ('queued', 'running', 'needs_input')`),
      ]);
      const pick = suggestAssignees(employees, open.map(toTask), input.skill)[0] ?? employees[0];
      if (!pick) throw new HttpError(409, 'There is nobody to assign this to');
      assignee = pick.id;
    }
    const now = this.now();
    try {
      const [row] = await this.db.query<TaskRow>(
        `WITH t AS (
           INSERT INTO tasks (assignee_id, title, details, skill, status, created_at) VALUES ($1, $2, $3, $4, 'queued', $5) RETURNING *
         ), e AS (
           INSERT INTO task_events (task_id, kind, text, at) SELECT id, 'sys', $6, $5 FROM t
         )
         SELECT * FROM t`,
        [assignee, input.title, input.details ?? '', input.skill, now, `Queued: “${input.title}” [${input.skill}]`],
      );
      return toTask(row);
    } catch (e) {
      if (pgCode(e) === '23503') throw new HttpError(404, 'No such employee');
      throw e;
    }
  }

  /** Only queued tasks can be edited. */
  async updateTask(id: number, patch: TaskPatch): Promise<Task> {
    const cols: Record<string, unknown> = {};
    if (patch.title !== undefined) cols.title = patch.title;
    if (patch.details !== undefined) cols.details = patch.details;
    if (patch.skill !== undefined) cols.skill = patch.skill;
    if (patch.assigneeId !== undefined) cols.assignee_id = patch.assigneeId;
    const keys = Object.keys(cols);
    try {
      const rows = await this.db.query<TaskRow>(
        `UPDATE tasks SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, version = version + 1
         WHERE id = $1 AND status = 'queued' RETURNING *`,
        [id, ...keys.map(k => cols[k])],
      );
      if (rows.length) return toTask(rows[0]);
    } catch (e) {
      if (pgCode(e) === '23503') throw new HttpError(404, 'No such employee');
      throw e;
    }
    await this.getTaskRow(id);
    throw new HttpError(409, 'Only queued tasks can be edited');
  }

  async cancelTask(id: number): Promise<Task> {
    const now = this.now();
    const [row] = await this.db.query<TaskRow>(
      `WITH t AS (
         UPDATE tasks SET status = 'cancelled', next_at = NULL, awaiting = NULL, finished_at = $2, version = version + 1
         WHERE id = $1 AND status IN ('queued', 'running', 'needs_input') RETURNING *
       ), e AS (
         INSERT INTO task_events (task_id, kind, text, at) SELECT id, 'deny', '■ Cancelled', $2 FROM t
       )
       SELECT * FROM t`,
      [id, now],
    );
    if (row) return toTask(row);
    await this.getTaskRow(id);
    throw new HttpError(409, 'This task has already finished');
  }

  async answerPermission(id: number, allow: boolean): Promise<Task> {
    const row = await this.getTaskRow(id);
    const adv = resolvePermission(toRun(row), allow, this.now());
    if (!adv || !(await this.apply(row, adv))) throw new HttpError(409, 'This task is not waiting for permission');
    return toTask(await this.getTaskRow(id));
  }

  private async getTaskRow(id: number): Promise<TaskRow> {
    const [row] = await this.db.query<TaskRow>(`SELECT * FROM tasks WHERE id = $1`, [id]);
    if (!row) throw new HttpError(404, 'No such task');
    return row;
  }

  /**
   * Writes a run's new state and log lines in one statement, only if nobody changed the
   * task since we read it (the version check). Returns whether it was applied.
   */
  private async apply(t: TaskRow, adv: Advance): Promise<boolean> {
    const p = adv.patch;
    const events = adv.events.map((e, ord) => ({ ...e, ord }));
    const [r] = await this.db.query<{ updated: number }>(
      `WITH upd AS (
         UPDATE tasks SET status = $2, step = $3, next_at = $4, progress = $5, awaiting = $6,
           started_at = COALESCE($7, started_at), finished_at = COALESCE($8, finished_at), version = version + 1
         WHERE id = $1 AND version = $9 RETURNING id
       ), ins AS (
         INSERT INTO task_events (task_id, kind, text, at)
         SELECT upd.id, e.kind, e.text, e.at
         FROM upd, jsonb_to_recordset($10::jsonb) AS e(kind text, text text, at double precision, ord int)
         ORDER BY e.ord
       )
       SELECT count(*)::int AS updated FROM upd`,
      [t.id, p.status, p.step, p.nextAt, p.progress, p.awaiting, p.startedAt ?? null, p.finishedAt ?? null, t.version, JSON.stringify(events)],
    );
    return r.updated === 1;
  }
}
