// The only thing the server needs from a database: run one parameterised SQL statement.
// Production uses Neon over HTTP (no connection pool to manage in serverless functions);
// local dev and tests use PGlite, an in-process Postgres.
//
// Every write is a single statement (CTEs where several tables change together), so
// nothing needs an interactive transaction, which Neon's HTTP driver doesn't offer.
//
// Timestamps are stored as epoch milliseconds in `double precision` columns: both drivers
// return those as plain numbers, unlike timestamptz or bigint.
import { neon } from '@neondatabase/serverless';

export interface Db {
  readonly kind: 'neon' | 'pglite';
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export function neonDb(connectionString: string): Db {
  const sql = neon(connectionString);
  return {
    kind: 'neon',
    query: async <T,>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[],
  };
}

/** `dataDir` is a folder to persist to, or omitted / 'memory://' for a throwaway database. */
export async function pgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dataDir && !dataDir.includes('://')) {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(dataDir, { recursive: true }); // PGlite only creates the last folder
  }
  const pg = new PGlite(dataDir);
  await pg.waitReady;
  return {
    kind: 'pglite',
    query: async <T,>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows,
  };
}
