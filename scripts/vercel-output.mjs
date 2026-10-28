// Packages the app for Vercel using the Build Output API
// (https://vercel.com/docs/build-output-api/v3): the built site as static files and
// the office API bundled into a single Node function at /api.
// Run after `npm run build`; vercel.json does both via `npm run build:vercel`.
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '.vercel', 'output');
const site = join(root, 'apps', 'web', 'dist');
if (!existsSync(join(site, 'index.html'))) throw new Error('apps/web/dist is missing: run `npm run build` first');

rmSync(out, { recursive: true, force: true });
cpSync(site, join(out, 'static'), { recursive: true });

const fn = join(out, 'functions', 'api.func');
mkdirSync(fn, { recursive: true });
await build({
  entryPoints: [join(root, 'apps', 'server', 'src', 'vercel.ts')],
  outfile: join(fn, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // PGlite is only for local dev; the Vercel entry never imports it.
  external: ['@electric-sql/pglite'],
  // Some dependencies still call require(); give the ESM bundle one.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'warning',
});
writeFileSync(join(fn, '.vc-config.json'), JSON.stringify({
  runtime: 'nodejs22.x',
  handler: 'index.mjs',
  launcherType: 'Nodejs',
  shouldAddHelpers: false,
  maxDuration: 300, // agent turns; see AgentConfig.workMs
}, null, 2));

writeFileSync(join(out, 'config.json'), JSON.stringify({
  version: 3,
  routes: [
    // Every /api/<path> goes to the one function, which reads the path back from __path.
    { src: '^/api(?:/(.*))?$', dest: '/api?__path=/$1' },
    { handle: 'filesystem' },
  ],
}, null, 2));

console.log(`Wrote ${out}`);
