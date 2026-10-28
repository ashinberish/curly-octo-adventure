// Browser smoke test: serves the production build (with the office API on a throwaway
// in-memory database), walks around, uses the panels, and fails on any page error.
// Screenshots go to e2e-output/.
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
const server = spawn(process.execPath, [new URL('bin/vite.js', 'file://' + require.resolve('vite/package.json')).pathname, 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  env: { ...process.env, PGLITE_DIR: 'memory://', DATABASE_URL: '', OFFICE_TOKEN: '' },
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
  await page.waitForSelector('.card:not(.hire)', { timeout: 15000 });
  check(await page.locator('.card:not(.hire)').count() === 8, 'eight employee cards from the server');
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
  await page.locator('.tasks .task', { hasText: 'wasd e' }).waitFor({ timeout: 5000 });
  check(await page.locator('.tasks .task', { hasText: 'wasd e' }).count() === 1, 'task assigned to Omar');
  await page.locator('.tasks .task', { hasText: 'wasd e' }).locator('button.link').click();
  await page.locator('.tasks .task', { hasText: 'wasd e' }).waitFor({ state: 'detached', timeout: 5000 });
  check(true, 'task cancelled');

  // Toggle a skill.
  await page.locator('.chip', { hasText: 'Data' }).click();
  await page.waitForTimeout(2000); // past a poll, so this is the server's answer
  check(await page.locator('.chip.on', { hasText: 'Data' }).count() === 1, 'skill toggled on and saved');

  // Hire someone, then let them go.
  await page.locator('.card.hire').click();
  await page.fill('input[aria-label="Name"]', 'Zed');
  await page.fill('input[aria-label="Role"]', 'Intern');
  await page.locator('.chip', { hasText: 'QA' }).click();
  await page.click('form button[type=submit]');
  await page.locator('.card', { hasText: 'ZED' }).waitFor({ timeout: 5000 });
  check(await page.locator('.emp-head h2').textContent() === 'Zed', 'hired Zed and selected them');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}hired.png` });
  page.once('dialog', d => void d.accept());
  await page.locator('.head-actions .btn.red').click();
  await page.locator('.card', { hasText: 'ZED' }).waitFor({ state: 'detached', timeout: 5000 });
  check(true, 'fired Zed');

  // Let the simulation run until someone needs approval, then approve it.
  await page.locator('.card', { hasText: 'GRACE' }).click();
  await page.waitForSelector('.approve', { timeout: 30000 });
  await page.screenshot({ path: `${out}needs-approval.png` });
  await page.click('.approve .btn.green');
  const approved = await page.locator('.console .done', { hasText: 'Approved' }).waitFor({ timeout: 5000 }).then(() => true, () => false);
  check(approved, 'approval logged');

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
