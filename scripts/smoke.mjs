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
/** Waits until the prompt for spot `id` shows up (a few frames in software rendering). */
const waitPrompt = (id) =>
  page.waitForFunction((id) => window.__game.zones.active?.id === id, id, { timeout: 60_000 });

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

  // Walking under the gate discovers the welcome scroll automatically. Opening the map
  // during the ceremony must keep the scroll from unrolling underneath it.
  await place(anchors.gate.x, anchors.gate.z + 1.5, Math.PI);
  await page.waitForFunction(() => window.__game.progress.has('welcome'), null, {
    timeout: 90_000,
  });
  await page.keyboard.press('KeyM');
  // the scroll would rise once the bow and the golden light are over (2.4 s)
  await page.waitForTimeout(3200);
  const layered = await page.evaluate(() => ({
    map: window.__game.map.isOpen,
    scroll: window.__game.scroll.isOpen,
    following: window.__valley.rig.isFollowing,
  }));
  if (!layered.map || layered.scroll) throw new Error('scroll opened under the map');
  if (!layered.following) throw new Error('camera stayed in the discovery shot');
  steps.push('gate (auto) + map during the ceremony: ok');

  // Tea pavilion: press E at the table.
  await step(
    'pavilion (E)',
    async () => {
      await place(anchors.pavilionTable.x - 1.4, anchors.pavilionTable.z + 1.2, 2.6);
      await waitPrompt('about');
      // keyboard players see the key, not the touch hint
      const key = await page.textContent('.hud__prompt kbd');
      if (key !== 'E') throw new Error(`prompt shows "${key}" instead of E`);
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
      await waitPrompt('dummy:0');
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
      await waitPrompt('milestone:1');
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
      await waitPrompt(`banner:${b.index}`);
      await page.keyboard.press('KeyE');
    },
    'projects',
  );

  // Ring the bell.
  await step(
    'bell (E)',
    async () => {
      await place(anchors.bell.x - 1.8, anchors.bell.z + 1.8, 2.4);
      await waitPrompt('bell');
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

  // Classic page view opens and closes; Escape closes it without opening the menu.
  await page.evaluate(() => window.__game.classic.open());
  await page.waitForSelector('.classic:not([hidden])');
  await page.click('.classic__play');
  await page.evaluate(() => window.__game.classic.open());
  await page.keyboard.press('Escape');
  const afterEscape = await page.evaluate(() => ({
    classic: window.__game.classic.isOpen,
    menu: window.__game.menu.isOpen,
  }));
  if (afterEscape.classic || afterEscape.menu) throw new Error('Escape from the page view');
  steps.push('classic view: ok');

  // Dragging on the canvas orbits the camera (the HUD layer must let it through).
  await closePanels();
  await page.waitForFunction(() => !window.__valley.uiBlocking);
  await page.waitForTimeout(500);
  const yaw0 = await page.evaluate(() => window.__valley.rig.targetYaw);
  await page.mouse.move(480, 300);
  await page.mouse.down();
  await page.mouse.move(640, 310, { steps: 8 });
  await page.mouse.up();
  const yaw1 = await page.evaluate(() => window.__valley.rig.targetYaw);
  if (Math.abs(yaw1 - yaw0) < 0.05) throw new Error('mouse drag did not orbit the camera');
  steps.push('mouse orbit: ok');

  // Space still jumps right after a panel was closed (focus must not stay on its buttons).
  await page.evaluate(() => window.__game.menu.open());
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__game.menu.close());
  const jumped = page.evaluate(
    () =>
      new Promise((resolve) => {
        window.__valley.controller.on('jump', () => resolve(true));
        setTimeout(() => resolve(false), 8000);
      }),
  );
  await page.keyboard.press('Space');
  if (!(await jumped)) throw new Error('Space did not jump after closing the menu');
  steps.push('jump after panel: ok');
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
