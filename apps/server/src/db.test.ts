import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { pgliteDb } from './db.ts';

const root = mkdtempSync(join(tmpdir(), 'pixel-office-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('pgliteDb', () => {
  it('creates missing parent folders for its data directory', async () => {
    const dir = join(root, 'nested', 'pglite');
    const a = await pgliteDb(dir);
    await a.query('CREATE TABLE t (n double precision)');
    await a.query('INSERT INTO t VALUES ($1)', [1.5]);
    expect(await a.query('SELECT n FROM t')).toEqual([{ n: 1.5 }]);
  }, 30_000);
});
