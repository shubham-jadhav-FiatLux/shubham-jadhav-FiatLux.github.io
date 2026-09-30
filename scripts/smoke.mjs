#!/usr/bin/env node
/**
 * End-to-end smoke test: loads the game in a headless browser and plays through every
 * discovery with real key presses (teleporting between landmarks to save time).
 *
 *   npm run dev            # in one terminal
 *   node scripts/smoke.mjs [url]
 *
 * Exits with a non-zero code if a scroll cannot be found or the page throws.
 */
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.setDefaultTimeout(180_000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

const sep = url.includes('?') ? '&' : '?';
await page.goto(`${url}${sep}quality=low&adaptive=0`);
await page.waitForSelector('.loader--ready', { timeout: 180_000 });
await page.evaluate(() => window.__game.progress.reset());
await page.click('.loader__begin');
await page.waitForTimeout(1500);

const place = (x, z, yaw) =>
  page.evaluate(
    ([x, z, yaw]) => {
      const app = window.__valley;
      app.controller.teleport(x, z, yaw);
      app.rig.startFollow(app.controller.position, yaw, 0.01);
    },
    [x, z, yaw],
  );
const found = () => page.evaluate(() => window.__game.progress.all);
const closePanels = () =>
  page.evaluate(() => {
    const g = window.__game;
    g.scroll.close();
    g.map.close();
    g.menu.close();
  });
/** Waits until the zone prompt shows up (a few frames in software rendering). */
const waitPrompt = () =>
  page.waitForFunction(() => window.__game.zones.active !== null, null, { timeout: 60_000 });

const steps = [];
async function step(name, fn, expect) {
  const t0 = Date.now();
  await closePanels();
  await fn();
  await page.waitForFunction((id) => window.__game.progress.has(id), expect, { timeout: 90_000 });
  // The discovery ceremony ends by unrolling the scroll: wait for it, then move on.
  await page.waitForFunction(
    (id) => window.__game.scroll.isOpen && window.__game.scroll.section === id,
    expect,
    {
      timeout: 90_000,
    },
  );
  steps.push(`${name}: ok (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

try {
  const anchors = await page.evaluate(() => window.__valley.architecture.anchors);

  // Walking under the gate discovers the welcome scroll automatically.
  await step('gate (auto)', () => place(anchors.gate.x, anchors.gate.z + 1.5, Math.PI), 'welcome');

  // Tea pavilion: press E at the table.
  await step(
    'pavilion (E)',
    async () => {
      await place(anchors.pavilionTable.x - 1.4, anchors.pavilionTable.z + 1.2, 2.6);
      await waitPrompt();
      await page.keyboard.press('KeyE');
    },
    'about',
  );

  // Training dummy: kung-fu strike with F.
  await step(
    'dummy (F)',
    async () => {
      const d = anchors.dummies[0];
      await place(d.x + 1.1, d.z + 1.1, -2.3);
      await waitPrompt();
      await page.keyboard.press('KeyF');
    },
    'skills',
  );

  // Bridge milestone.
  await step(
    'milestone (E)',
    async () => {
      const m = anchors.milestones[1];
      await place(m.x, m.z, Math.PI);
      await waitPrompt();
      await page.keyboard.press('KeyE');
    },
    'journey',
  );

  // Project banner.
  await step(
    'banner (E)',
    async () => {
      const b = anchors.banners[0];
      await place(b.x, b.z + 0.6, Math.PI);
      await waitPrompt();
      await page.keyboard.press('KeyE');
    },
    'projects',
  );

  // Ring the bell.
  await step(
    'bell (E)',
    async () => {
      await place(anchors.bell.x - 1.8, anchors.bell.z + 1.8, 2.4);
      await waitPrompt();
      await page.keyboard.press('KeyE');
    },
    'contact',
  );

  // Map + quick travel.
  await closePanels();
  await page.keyboard.press('KeyM');
  await page.waitForFunction(() => window.__game.map.isOpen);
  await page.click('.map__marker >> nth=1');
  await page.waitForFunction(() => !window.__game.map.isOpen);
  steps.push('map quick travel: ok');

  // Classic page view opens and closes.
  await page.evaluate(() => window.__game.classic.open());
  await page.waitForSelector('.classic:not([hidden])');
  await page.click('.classic__play');
  steps.push('classic view: ok');
} catch (err) {
  errors.push(String(err));
}

const all = await found().catch(() => []);
console.log(steps.join('\n'));
console.log(`scrolls found: ${all.length}/6 (${all.join(', ')})`);
await browser.close();
if (errors.length || all.length !== 6) {
  console.error('FAILED');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log('PASSED');
