// Regenerates the tileset, furniture atlas and Tiled map in public/.
// Run with `npm run assets` (Node >= 22.18 runs TypeScript directly).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAssets } from '../src/art/assets.ts';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
for (const [path, data] of Object.entries(buildAssets())) {
  const out = join(publicDir, path);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, data);
  console.log(`wrote public/${path} (${data.length} bytes)`);
}
