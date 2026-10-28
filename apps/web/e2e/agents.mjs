// Browser test of the Claude agent screens, against the scripted stand-in model
// (AGENT_FAKE=1, see apps/server/src/agent/fake.ts): no API key, no cost.
// Usage: npm run build && npm run smoke:agents
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = 4181;
const out = new URL('../e2e-output/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const vite = new URL('bin/vite.js', 'file://' + require.resolve('vite/package.json')).pathname;
const server = spawn(process.execPath, [vite, 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  env: { ...process.env, PGLITE_DIR: 'memory://', DATABASE_URL: '', OFFICE_TOKEN: '', ANTHROPIC_API_KEY: '', AGENT_FAKE: '1' },
});
async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(`vite preview exited with ${server.exitCode}`);
    try { if ((await fetch(`http://localhost:${PORT}/`)).ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('vite preview did not start');
}

const failures = [];
const check = (ok, what) => { console.log(`${ok ? '✓' : '✗'} ${what}`); if (!ok) failures.push(what); };
const appears = (locator, timeout = 20000) => locator.waitFor({ timeout }).then(() => true, () => false);

try {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));

  await page.goto(`http://localhost:${PORT}/`);
  check(await appears(page.locator('.badge.live', { hasText: 'Claude agents' })), 'badge shows Claude agents');

  // Priya's seeded task runs as an agent: plan.md, then a question.
  await page.locator('.card', { hasText: 'PRIYA' }).click();
  check(await appears(page.locator('.approve.question', { hasText: 'one-page summary' })), 'agent asks a question');
  check(await appears(page.locator('.console .tool', { hasText: 'write_file("plan.md")' })), 'console shows the file write');
  await page.locator('.files .file', { hasText: 'plan.md' }).click();
  check(await appears(page.locator('.viewer pre', { hasText: '# Plan: Write launch blog post' })), 'file preview shows plan.md');
  await page.screenshot({ path: `${out}agent-question.png` });

  await page.fill('textarea[aria-label="Your answer"]', 'yes please');
  await page.click('.approve.question button[type=submit]');
  check(await appears(page.locator('.summary', { hasText: 'You said: “yes please”' })), 'agent finishes using the answer');
  check(await appears(page.locator('.console .done', { hasText: 'You answered: yes please' }), 5000), 'answer logged');
  await page.screenshot({ path: `${out}agent-done.png` });

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await browser.close();
} catch (e) {
  failures.push(String(e));
  console.error(e);
} finally {
  server.kill();
}
if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log(`\nAll checks passed. Screenshots in ${out}`);
process.exit(0);
