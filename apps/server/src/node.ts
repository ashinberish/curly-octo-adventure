import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Api } from './api.ts';

const MAX_BODY = 64 * 1024;

async function readJson(req: IncomingMessage): Promise<{ ok: true; body: unknown } | { ok: false; error: string }> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) return { ok: false, error: 'Request body is too large' };
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return { ok: true, body: undefined };
  try { return { ok: true, body: JSON.parse(raw) }; } catch { return { ok: false, error: 'Request body is not valid JSON' }; }
}

/**
 * Serves the API from a Node request whose URL starts with /api. On Vercel the route
 * config rewrites /api/<path> to /api?__path=/<path>, so that's read first.
 */
export function toNodeHandler(api: Api) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(JSON.stringify(body));
    };
    const url = new URL(req.url ?? '/', 'http://localhost');
    let path = url.searchParams.get('__path') ?? url.pathname;
    url.searchParams.delete('__path');
    if (path.startsWith('/api')) path = path.slice(4);
    path = path.replace(/\/+$/, '') || '/';

    const method = req.method ?? 'GET';
    let body: unknown;
    if (method !== 'GET' && method !== 'HEAD') {
      const parsed = await readJson(req);
      if (!parsed.ok) return send(400, { error: parsed.error });
      body = parsed.body;
    }
    const out = await api({ method, path, query: url.searchParams, body, authorization: req.headers.authorization });
    send(out.status, out.body);
  };
}
