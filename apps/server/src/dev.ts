// Serves /api from the Vite dev and preview servers, so `npm run dev` is the whole app.
// Uses PGlite saved under .data/pglite (PGLITE_DIR=memory:// for a throwaway database),
// or Neon if DATABASE_URL is set. Set ANTHROPIC_API_KEY for real Claude agents.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { agentsFromEnv, readAgentConfig } from './agent/config.ts';
import { fakeModel } from './agent/fake.ts';
import { claudeCaller } from './agent/claude.ts';
import { createApi } from './api.ts';
import { neonDb, pgliteDb, type Db } from './db.ts';
import { DESK_IDS } from './desks.ts';
import { toNodeHandler } from './node.ts';

const DEFAULT_DIR = fileURLToPath(new URL('../../../.data/pglite', import.meta.url));

export function devApiMiddleware() {
  let db: Promise<Db> | undefined;
  const handler = toNodeHandler(createApi({
    db: () => {
      db ??= process.env.DATABASE_URL ? Promise.resolve(neonDb(process.env.DATABASE_URL)) : pgliteDb(process.env.PGLITE_DIR || DEFAULT_DIR);
      db.catch(() => { db = undefined; }); // try again on the next request
      return db;
    },
    desks: DESK_IDS,
    writeToken: process.env.OFFICE_TOKEN || undefined,
    // Locally there are no strangers, so a token isn't required for real agents.
    // AGENT_FAKE=1 runs agents against a scripted stand-in model instead (no API key, no cost).
    agents: process.env.AGENT_FAKE === '1'
      ? { enabled: true, config: { ...readAgentConfig(process.env), workMs: 20_000 }, callModel: fakeModel }
      : agentsFromEnv(process.env, { requireToken: false, makeCaller: claudeCaller }),
  }));
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url === '/api' || req.url?.startsWith('/api/') || req.url?.startsWith('/api?')) void handler(req, res);
    else next();
  };
}
