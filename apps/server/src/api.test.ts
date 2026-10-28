import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Employee, LogLine, OfficeSnapshot, Task } from '@pixel-office/shared';
import { createApi, type Api } from './api.ts';
import { pgliteDb, type Db } from './db.ts';
import { DESK_IDS } from './desks.ts';
import { toNodeHandler } from './node.ts';
import { SEED_EMPLOYEES } from './seed.ts';

const look = { hair: '#112233', style: 'bun', skin: '#ffddcc', shirt: '#aa0000', pants: '#000033' };

let pg: Db;
let db: Db;
let clock: number;
let api: Api;

beforeAll(async () => { pg = await pgliteDb(); }); // one in-memory Postgres for the file

beforeEach(async () => {
  await pg.query('DROP SCHEMA public CASCADE');
  await pg.query('CREATE SCHEMA public');
  db = { kind: pg.kind, query: pg.query }; // a new identity, so the API migrates and seeds again
  clock = 1_000_000;
  api = createApi({ db: async () => db, desks: DESK_IDS, now: () => clock });
});

async function call<T = unknown>(method: string, path: string, body?: unknown, authorization?: string): Promise<{ status: number; body: T }> {
  const [p, q = ''] = path.split('?');
  return api({ method, path: p, query: new URLSearchParams(q), body, authorization }) as Promise<{ status: number; body: T }>;
}
const state = async () => (await call<OfficeSnapshot>('GET', '/state')).body;
const task = async (id: number) => (await state()).tasks.find(t => t.id === id)!;
const log = async (id: number) => (await call<{ events: LogLine[] }>('GET', `/tasks/${id}/events`)).body.events;

describe('office API', () => {
  it('seeds a new office with the demo team and every desk', async () => {
    const s = await state();
    expect(s.employees.map(e => e.id)).toEqual(SEED_EMPLOYEES.map(e => e.id));
    expect(s.desks).toEqual(DESK_IDS);
    expect(s.serverTime).toBe(clock);
    for (const e of SEED_EMPLOYEES) expect(DESK_IDS).toContain(e.deskId);
    expect((await call('GET', '/health')).body).toEqual({ ok: true, db: 'pglite' });
  });

  it('starts queued work right away and catches up runs on the next poll', async () => {
    let s = await state();
    const grace = s.tasks.find(t => t.assigneeId === 'grace')!;
    expect(grace.status).toBe('running');
    expect(s.tasks.filter(t => t.assigneeId === 'ada').map(t => t.status)).toEqual(['running', 'queued']);

    clock += 60 * 60_000; // an hour later, nobody watching
    s = await state();
    expect(s.tasks.find(t => t.id === grace.id)!.status).toBe('needs_input');
    expect(s.tasks.find(t => t.assigneeId === 'priya')!.status).toBe('done');
    const lines = await log(grace.id);
    expect(lines.map(l => l.kind)).toContain('perm');
    expect(lines.map(l => l.id)).toEqual([...lines.map(l => l.id)].sort((a, b) => a - b));
  });

  it('runs one task at a time per person, then the next', async () => {
    await state();
    clock += 60 * 60_000;
    let s = await state();
    const [first, second] = s.tasks.filter(t => t.assigneeId === 'ada');
    expect(first.status).toBe('needs_input');
    expect(second.status).toBe('queued');
    await call('POST', `/tasks/${first.id}/permission`, { allow: true });
    clock += 60_000;
    s = await state();
    expect(s.tasks.find(t => t.id === first.id)!.status).toBe('done');
    expect(s.tasks.find(t => t.id === second.id)!.status).toBe('running');
  });

  it('approves and denies permission requests', async () => {
    await state();
    clock += 60 * 60_000;
    const s = await state();
    const [ada] = s.tasks.filter(t => t.assigneeId === 'ada');
    const grace = s.tasks.find(t => t.assigneeId === 'grace')!;

    expect((await call<Task>('POST', `/tasks/${ada.id}/permission`, { allow: true })).body.status).toBe('running');
    expect((await call('POST', `/tasks/${ada.id}/permission`, { allow: true })).status).toBe(409);
    expect((await call('POST', `/tasks/${grace.id}/permission`, { allow: false })).status).toBe(200);
    clock += 60_000;
    await state();
    expect((await log(ada.id)).some(l => l.text.includes('48 passed'))).toBe(true);
    expect((await log(grace.id)).some(l => l.kind === 'deny')).toBe(true);
    expect((await log(grace.id)).some(l => l.text.includes('12,408 rows'))).toBe(false);
    expect((await call('POST', `/tasks/${ada.id}/permission`, { allow: 'yes' })).status).toBe(400);
  });

  it('does not double-play steps when two polls race', async () => {
    await state();
    clock += 3000;
    await Promise.all([state(), state(), state()]);
    const grace = (await state()).tasks.find(t => t.assigneeId === 'grace')!;
    const texts = (await log(grace.id)).map(l => l.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('hires, edits and fires employees', async () => {
    const hired = await call<Employee>('POST', '/employees', { name: ' Zoe Q ', role: 'Analyst', skills: ['Data', 'Data'], look });
    expect(hired.status).toBe(201);
    expect(hired.body).toMatchObject({ name: 'Zoe Q', skills: ['Data'], deskId: 'eng-4' }); // first free desk
    expect(hired.body.id).toMatch(/^zoe-q-/);

    const moved = await call<Employee>('PATCH', `/employees/${hired.body.id}`, { deskId: 'studio-3', skills: ['Data', 'QA'] });
    expect(moved.body).toMatchObject({ deskId: 'studio-3', skills: ['Data', 'QA'] });
    expect((await call('PATCH', `/employees/${hired.body.id}`, { deskId: 'eng-1' })).status).toBe(409);
    expect((await call('PATCH', `/employees/${hired.body.id}`, { deskId: 'roof' })).status).toBe(400);

    expect((await call('DELETE', `/employees/${hired.body.id}`)).status).toBe(200);
    expect((await call('DELETE', `/employees/${hired.body.id}`)).status).toBe(404);
    expect((await state()).employees.some(e => e.id === hired.body.id)).toBe(false);
  });

  it('refuses to hire when every desk is taken', async () => {
    const free = DESK_IDS.length - SEED_EMPLOYEES.length;
    for (let i = 0; i < free; i++) expect((await call('POST', '/employees', { name: `N${i}`, role: 'r', look })).status).toBe(201);
    expect((await call<{ error: string }>('POST', '/employees', { name: 'One more', role: 'r', look })).body.error).toBe('No free desks');
  });

  it('validates input', async () => {
    expect((await call('POST', '/employees', { name: '', role: 'x', look })).status).toBe(400);
    expect((await call('POST', '/employees', { name: 'A', role: 'x', look: { ...look, hair: 'red' } })).status).toBe(400);
    expect((await call('POST', '/employees', { name: 'A', role: 'x', look, skills: ['Juggling'] })).status).toBe(400);
    expect((await call('POST', '/tasks', { assigneeId: 'ada', title: 'x', skill: 'Nope' })).status).toBe(400);
    expect((await call('POST', '/tasks', { assigneeId: 'nobody', title: 'x', skill: 'Code' })).status).toBe(404);
    expect((await call('POST', '/tasks', 'hello')).status).toBe(400);
    expect((await call('GET', '/nope')).status).toBe(404);
  });

  it('auto-assigns, edits queued tasks and cancels', async () => {
    await state();
    const t = (await call<Task>('POST', '/tasks', { assigneeId: 'auto', title: 'Rotate keys', skill: 'DevOps' })).body;
    expect(t).toMatchObject({ assigneeId: 'kenji', status: 'queued', details: '' }); // Ada is busier
    // Kenji is free, so the next poll starts it; edits then aren't allowed.
    const queued = (await call<Task>('POST', '/tasks', { assigneeId: 'ada', title: 'Later', skill: 'Code' })).body;
    expect((await call<Task>('PATCH', `/tasks/${queued.id}`, { title: 'Sooner', assigneeId: 'linus' })).body).toMatchObject({ title: 'Sooner', assigneeId: 'linus' });
    await state();
    expect((await task(t.id)).status).toBe('running');
    expect((await call('PATCH', `/tasks/${t.id}`, { title: 'x' })).status).toBe(409);

    expect((await call<Task>('POST', `/tasks/${t.id}/cancel`)).body.status).toBe('cancelled');
    expect((await call('POST', `/tasks/${t.id}/cancel`)).status).toBe(409);
    expect((await state()).tasks.some(x => x.id === t.id)).toBe(false);
    expect((await log(t.id)).at(-1)!.text).toBe('■ Cancelled');
  });

  it('removes a fired employee’s tasks', async () => {
    await call('DELETE', '/employees/ada');
    expect((await state()).tasks.some(t => t.assigneeId === 'ada')).toBe(false);
  });

  it('pages run logs with ?after', async () => {
    await state();
    const grace = (await state()).tasks.find(t => t.assigneeId === 'grace')!;
    const all = await log(grace.id);
    const rest = (await call<{ events: LogLine[] }>('GET', `/tasks/${grace.id}/events?after=${all[0].id}`)).body.events;
    expect(rest).toEqual(all.slice(1));
  });
});

describe('write token', () => {
  it('requires the token for changes but not for reading', async () => {
    api = createApi({ db: async () => db, desks: DESK_IDS, now: () => clock, writeToken: 's3cret' });
    expect((await call('GET', '/state')).status).toBe(200);
    expect((await call('POST', '/tasks', { assigneeId: 'ada', title: 'x', skill: 'Code' })).status).toBe(401);
    expect((await call('POST', '/tasks', { assigneeId: 'ada', title: 'x', skill: 'Code' }, 'Bearer nope')).status).toBe(401);
    expect((await call('POST', '/tasks', { assigneeId: 'ada', title: 'x', skill: 'Code' }, 'Bearer s3cret')).status).toBe(201);
  });
});

describe('Node adapter', () => {
  let server: Server;
  afterAll(() => server?.close());

  it('serves /api paths, Vercel-style rewrites and JSON errors', async () => {
    server = createServer(toNodeHandler(createApi({ db: async () => db, desks: DESK_IDS, now: () => clock })));
    await new Promise<void>(r => server.listen(0, r));
    const base = `http://localhost:${(server.address() as AddressInfo).port}`;

    const direct = await fetch(`${base}/api/state`);
    expect(direct.status).toBe(200);
    expect(direct.headers.get('cache-control')).toBe('no-store');
    expect(((await direct.json()) as OfficeSnapshot).employees).toHaveLength(SEED_EMPLOYEES.length);

    const rewritten = await fetch(`${base}/api?__path=/health`);
    expect(await rewritten.json()).toEqual({ ok: true, db: 'pglite' });

    const bad = await fetch(`${base}/api/tasks`, { method: 'POST', body: '{nope', headers: { 'content-type': 'application/json' } });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'Request body is not valid JSON' });
  });
});
