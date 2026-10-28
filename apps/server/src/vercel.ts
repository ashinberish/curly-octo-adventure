// Entry point of the Vercel function serving /api/*. Bundled by scripts/vercel-output.mjs.
import { createApi } from './api.ts';
import { neonDb, type Db } from './db.ts';
import { DESK_IDS } from './desks.ts';
import { HttpError } from './errors.ts';
import { toNodeHandler } from './node.ts';

// The Neon integration on Vercel sets DATABASE_URL (and POSTGRES_URL for older setups).
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
let db: Db | undefined;

export default toNodeHandler(createApi({
  db: async () => {
    if (!url) throw new HttpError(503, 'The office has no database yet. In Vercel, add Neon (Storage → Create Database → Neon), connect it to this project, then redeploy.');
    return (db ??= neonDb(url));
  },
  desks: DESK_IDS,
  writeToken: process.env.OFFICE_TOKEN || undefined,
}));
