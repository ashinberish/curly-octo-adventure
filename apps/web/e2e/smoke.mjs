// Browser smoke test: serves the production build, walks around, uses the panels,
// and fails on any page error. Screenshots go to e2e-output/.
// Usage: npm run build && npm run smoke   (needs Playwright with Chromium installed)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = 4179;
const out = new URL('../e2e-output/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

// Run vite's own entry point (not through npx) so killing it really stops the server.
const server = spawn(process.execPath, [new URL('bin/vite.js', 'file://' + require.resolve('vite/package.json')).pathname, 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
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

try {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));

  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('.game-host canvas', { timeout: 15000 });
  await page.waitForTimeout(1500);
  check(await page.locator('.card').count() === 8, 'eight employee cards');
  await page.screenshot({ path: `${out}start.png` });

  // Walk: up to the engineering desks, then right.
  await page.locator('.game-host canvas').click({ position: { x: 5, y: 5 } }); // focus the page, not a field
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(800); await page.keyboard.up('ArrowUp');
  await page.keyboard.down('d'); await page.waitForTimeout(600); await page.keyboard.up('d');
  await page.screenshot({ path: `${out}walked.png` });

  // Select someone from the card strip; the camera should follow them.
  await page.locator('.card', { hasText: 'OMAR' }).click();
  await page.waitForTimeout(1200);
  check(await page.locator('.emp-head h2').textContent() === 'Omar', 'card selects Omar');
  await page.screenshot({ path: `${out}omar.png` });

  // Typing "wasd e" in the form must not move the player or trigger E.
  await page.fill('input[aria-label="Task title"]', 'wasd e');
  await page.selectOption('select[aria-label="Skill needed"]', 'Code');
  check((await page.locator('.warn').textContent())?.includes("doesn't have Code"), 'skill mismatch warning');
  await page.click('form button[type=submit]');
  await page.waitForTimeout(500);
  check(await page.locator('.tasks .task', { hasText: 'wasd e' }).count() === 1, 'task assigned to Omar');

  // Toggle a skill.
  await page.locator('.chip', { hasText: 'Data' }).click();
  check(await page.locator('.chip.on', { hasText: 'Data' }).count() === 1, 'skill toggled on');

  // Let the simulation run until someone needs approval, then approve it.
  await page.locator('.card', { hasText: 'GRACE' }).click();
  await page.waitForSelector('.approve', { timeout: 30000 });
  await page.screenshot({ path: `${out}needs-approval.png` });
  await page.click('.approve .btn.green');
  check(await page.locator('.console .done', { hasText: 'Approved' }).count() === 1, 'approval logged');

  await page.locator('.tabs button', { hasText: 'Task board' }).click();
  check(await page.locator('.colhead').count() === 4, 'task board columns');
  await page.screenshot({ path: `${out}board.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}mobile.png` });

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
