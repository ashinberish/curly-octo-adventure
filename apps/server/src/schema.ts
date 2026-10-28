import type { Db } from './db.ts';
import { SEED_EMPLOYEES, seedTasks } from './seed.ts';

// Append new migrations; never edit an applied one. Statements must be idempotent:
// two cold-starting functions can race to apply the same migration.
const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE IF NOT EXISTS employees (
      id text PRIMARY KEY,
      name text NOT NULL,
      role text NOT NULL,
      skills text[] NOT NULL DEFAULT '{}',
      look jsonb NOT NULL,
      desk_id text NOT NULL UNIQUE,
      created_at double precision NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS tasks (
      id serial PRIMARY KEY,
      assignee_id text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      title text NOT NULL,
      details text NOT NULL DEFAULT '',
      skill text NOT NULL,
      status text NOT NULL CHECK (status IN ('queued', 'running', 'needs_input', 'done', 'cancelled')),
      progress real NOT NULL DEFAULT 0,
      awaiting text,
      step integer NOT NULL DEFAULT 0,
      next_at double precision,
      version integer NOT NULL DEFAULT 0,
      created_at double precision NOT NULL,
      started_at double precision,
      finished_at double precision
    )`,
    `CREATE INDEX IF NOT EXISTS tasks_status ON tasks (status, assignee_id)`,
    `CREATE TABLE IF NOT EXISTS task_events (
      id bigserial PRIMARY KEY,
      task_id integer NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      kind text NOT NULL,
      text text NOT NULL,
      at double precision NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS task_events_task ON task_events (task_id, id)`,
  ],
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: Db): Promise<void> {
  await db.query(`CREATE TABLE IF NOT EXISTS meta (key text PRIMARY KEY, value text NOT NULL)`);
  const [row] = await db.query<{ value: string }>(`SELECT value FROM meta WHERE key = 'schema_version'`);
  const current = row ? Number(row.value) : 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    for (const statement of MIGRATIONS[v]) await db.query(statement);
    await db.query(
      `INSERT INTO meta (key, value) VALUES ('schema_version', $1)
       ON CONFLICT (key) DO UPDATE SET value = GREATEST(meta.value::int, EXCLUDED.value::int)::text`,
      [String(v + 1)],
    );
  }
}

/** Fills a brand-new office with the demo team, once. Firing everyone later doesn't bring them back. */
export async function seedOnce(db: Db, now: number): Promise<boolean> {
  const won = await db.query(`INSERT INTO meta (key, value) VALUES ('seeded', $1) ON CONFLICT (key) DO NOTHING RETURNING key`, [String(now)]);
  if (!won.length) return false;
  for (const [i, e] of SEED_EMPLOYEES.entries()) {
    // Distinct created_at keeps the team in seed order.
    await db.query(
      `INSERT INTO employees (id, name, role, skills, look, desk_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
      [e.id, e.name, e.role, e.skills, JSON.stringify(e.look), e.deskId, now - SEED_EMPLOYEES.length + i],
    );
  }
  for (const t of seedTasks(now)) {
    const [{ id }] = await db.query<{ id: number }>(
      `INSERT INTO tasks (assignee_id, title, details, skill, status, progress, step, created_at, started_at, finished_at)
       VALUES ($1, $2, '', $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [t.assigneeId, t.title, t.skill, t.status, t.progress, t.step, now, t.startedAt, t.finishedAt],
    );
    for (const l of t.log) await db.query(`INSERT INTO task_events (task_id, kind, text, at) VALUES ($1, $2, $3, $4)`, [id, l.kind, l.text, l.at]);
  }
  return true;
}

const ready = new WeakMap<Db, Promise<void>>();

/** Migrates and seeds once per database per process (retries after a failure). */
export function ensureReady(db: Db, now: () => number): Promise<void> {
  let p = ready.get(db);
  if (!p) {
    p = (async () => { await migrate(db); await seedOnce(db, now()); })();
    p.catch(() => ready.delete(db));
    ready.set(db, p);
  }
  return p;
}
