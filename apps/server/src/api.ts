// The office REST API, independent of any HTTP server. node.ts adapts it to Node's
// req/res for the Vercel function and the Vite dev server.
//
//   GET    /health
//   GET    /state                      employees, open + recent tasks, desks (also advances the simulation)
//   GET    /tasks/:id/events?after=N  run log lines after id N
//   POST   /employees                  hire
//   PATCH  /employees/:id              rename, change role, skills, look or desk
//   DELETE /employees/:id              fire (removes their tasks too)
//   POST   /tasks                      assign (assigneeId may be "auto")
//   PATCH  /tasks/:id                  edit a queued task
//   POST   /tasks/:id/cancel
//   POST   /tasks/:id/permission       { allow: boolean }
import { timingSafeEqual } from 'node:crypto';
import type { Db } from './db.ts';
import { HttpError } from './errors.ts';
import { Office } from './office.ts';
import { ensureReady } from './schema.ts';
import * as v from './validate.ts';

export interface ApiRequest {
  method: string;
  /** Path below /api, e.g. "/tasks/3/cancel". */
  path: string;
  query: URLSearchParams;
  body: unknown;
  authorization?: string;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

export interface ApiOptions {
  db: () => Promise<Db>;
  desks: readonly string[];
  /** When set, every request that changes something must send `Authorization: Bearer <token>`. */
  writeToken?: string;
  now?: () => number;
}

export type Api = (req: ApiRequest) => Promise<ApiResponse>;

function tokenMatches(header: string | undefined, token: string): boolean {
  const given = Buffer.from(header?.replace(/^Bearer\s+/i, '') ?? '');
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
}

const id = (s: string) => {
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n <= 0) throw new HttpError(404, 'Not found');
  return n;
};

export function createApi(opts: ApiOptions): Api {
  const now = opts.now ?? Date.now;

  async function route(req: ApiRequest, office: Office, db: Db): Promise<ApiResponse> {
    const { method, path } = req;
    const ok = (body: unknown, status = 200): ApiResponse => ({ status, body });
    let m: RegExpExecArray | null;

    if (method === 'GET' && path === '/health') return ok({ ok: true, db: db.kind });
    if (method === 'GET' && path === '/state') return ok(await office.snapshot());
    if (method === 'GET' && (m = /^\/tasks\/([^/]+)\/events$/.exec(path))) {
      return ok({ events: await office.events(id(m[1]), Number(req.query.get('after') ?? 0) || 0) });
    }

    if (method !== 'GET' && opts.writeToken && !tokenMatches(req.authorization, opts.writeToken)) {
      throw new HttpError(401, 'This office needs a token to make changes');
    }
    if (method === 'POST' && path === '/employees') return ok(await office.hire(v.newEmployee(req.body)), 201);
    if ((m = /^\/employees\/([^/]+)$/.exec(path))) {
      const employeeId = decodeURIComponent(m[1]);
      if (method === 'PATCH') return ok(await office.updateEmployee(employeeId, v.employeePatch(req.body)));
      if (method === 'DELETE') { await office.fire(employeeId); return ok({ ok: true }); }
    }
    if (method === 'POST' && path === '/tasks') return ok(await office.addTask(v.newTask(req.body)), 201);
    if (method === 'PATCH' && (m = /^\/tasks\/([^/]+)$/.exec(path))) return ok(await office.updateTask(id(m[1]), v.taskPatch(req.body)));
    if (method === 'POST' && (m = /^\/tasks\/([^/]+)\/cancel$/.exec(path))) return ok(await office.cancelTask(id(m[1])));
    if (method === 'POST' && (m = /^\/tasks\/([^/]+)\/permission$/.exec(path))) return ok(await office.answerPermission(id(m[1]), v.permission(req.body)));
    throw new HttpError(404, 'Not found');
  }

  return async req => {
    try {
      const db = await opts.db();
      await ensureReady(db, now);
      return await route(req, new Office(db, opts.desks, now), db);
    } catch (e) {
      if (e instanceof HttpError) return { status: e.status, body: { error: e.message } };
      console.error(e);
      return { status: 500, body: { error: 'Something went wrong in the office server' } };
    }
  };
}
