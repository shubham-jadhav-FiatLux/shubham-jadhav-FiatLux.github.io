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

const sj_url = process.argv[2] ?? 'http://localhost:5173/';
const sj_browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const sj_page = await sj_browser.newPage({ viewport: { width: 960, height: 540 } });
sj_page.setDefaultTimeout(180_000);
const sj_errors = [];
sj_page.on('pageerror', (sj_e) => sj_errors.push(sj_e.message));
sj_page.on('console', (sj_m) => {
  if (sj_m.type() === 'error') sj_errors.push(sj_m.text());
});

const sj_sep = sj_url.includes('?') ? '&' : '?';
await sj_page.goto(`${sj_url}${sj_sep}quality=low&adaptive=0`);
await sj_page.waitForSelector('.loader--ready', { timeout: 180_000 });
await sj_page.evaluate(() => window.__game.progress.reset());
await sj_page.click('.loader__begin');
await sj_page.waitForTimeout(1500);

const sj_place = (sj_x, sj_z, sj_yaw) =>
  sj_page.evaluate(
    ([sj_x, sj_z, sj_yaw]) => {
      const sj_app = window.__valley;
      sj_app.controller.teleport(sj_x, sj_z, sj_yaw);
      sj_app.rig.startFollow(sj_app.controller.position, sj_yaw, 0.01);
    },
    [sj_x, sj_z, sj_yaw],
  );
const sj_found = () => sj_page.evaluate(() => window.__game.progress.all);
const sj_closePanels = () =>
  sj_page.evaluate(() => {
    const sj_g = window.__game;
    sj_g.scroll.close();
    sj_g.map.close();
    sj_g.menu.close();
  });
/** Waits until the prompt for spot `sj_id` shows up (a few frames in software rendering). */
const sj_waitPrompt = (sj_id) =>
  sj_page.waitForFunction((sj_id) => window.__game.zones.active?.id === sj_id, sj_id, {
    timeout: 60_000,
  });

const sj_steps = [];
async function step(sj_name, sj_fn, sj_expect) {
  const sj_t0 = Date.now();
  await sj_closePanels();
  await sj_fn();
  await sj_page.waitForFunction((sj_id) => window.__game.progress.has(sj_id), sj_expect, {
    timeout: 90_000,
  });
  // The discovery ceremony ends by unrolling the scroll: wait for it, then move on.
  await sj_page.waitForFunction(
    (sj_id) => window.__game.scroll.isOpen && window.__game.scroll.section === sj_id,
    sj_expect,
    {
      timeout: 90_000,
    },
  );
  sj_steps.push(`${sj_name}: ok (${((Date.now() - sj_t0) / 1000).toFixed(1)}s)`);
}

try {
  const sj_anchors = await sj_page.evaluate(() => window.__valley.architecture.anchors);

  // Walking under the gate discovers the welcome scroll automatically. Opening the map
  // during the ceremony must keep the scroll from unrolling underneath it.
  await sj_place(sj_anchors.gate.x, sj_anchors.gate.z + 1.5, Math.PI);
  await sj_page.waitForFunction(() => window.__game.progress.has('welcome'), null, {
    timeout: 90_000,
  });
  await sj_page.keyboard.press('KeyM');
  // the scroll would rise once the bow and the golden light are over (2.4 s)
  await sj_page.waitForTimeout(3200);
  const sj_layered = await sj_page.evaluate(() => ({
    map: window.__game.map.isOpen,
    scroll: window.__game.scroll.isOpen,
    following: window.__valley.rig.isFollowing,
  }));
  if (!sj_layered.map || sj_layered.scroll) throw new Error('scroll opened under the map');
  if (!sj_layered.following) throw new Error('camera stayed in the discovery shot');
  sj_steps.push('gate (auto) + map during the ceremony: ok');

  // Tea pavilion: press E at the table.
  await step(
    'pavilion (E)',
    async () => {
      await sj_place(sj_anchors.pavilionTable.x - 1.4, sj_anchors.pavilionTable.z + 1.2, 2.6);
      await sj_waitPrompt('about');
      // keyboard players see the key, not the touch hint
      const sj_key = await sj_page.textContent('.hud__prompt kbd');
      if (sj_key !== 'E') throw new Error(`prompt shows "${sj_key}" instead of E`);
      await sj_page.keyboard.press('KeyE');
    },
    'about',
  );

  // Training dummy: kung-fu strike with F.
  await step(
    'dummy (F)',
    async () => {
      const sj_d = sj_anchors.dummies[0];
      await sj_place(sj_d.x + 1.1, sj_d.z + 1.1, -2.3);
      await sj_waitPrompt('dummy:0');
      await sj_page.keyboard.press('KeyF');
    },
    'skills',
  );

  // Bridge milestone.
  await step(
    'milestone (E)',
    async () => {
      const sj_m = sj_anchors.milestones[1];
      await sj_place(sj_m.x, sj_m.z, Math.PI);
      await sj_waitPrompt('milestone:1');
      await sj_page.keyboard.press('KeyE');
    },
    'journey',
  );

  // Project banner.
  await step(
    'banner (E)',
    async () => {
      const sj_b = sj_anchors.banners[0];
      await sj_place(sj_b.x, sj_b.z + 0.6, Math.PI);
      await sj_waitPrompt(`banner:${sj_b.index}`);
      await sj_page.keyboard.press('KeyE');
    },
    'projects',
  );

  // Ring the bell.
  await step(
    'bell (E)',
    async () => {
      await sj_place(sj_anchors.bell.x - 1.8, sj_anchors.bell.z + 1.8, 2.4);
      await sj_waitPrompt('bell');
      await sj_page.keyboard.press('KeyE');
    },
    'contact',
  );

  // Map + quick travel.
  await sj_closePanels();
  await sj_page.keyboard.press('KeyM');
  await sj_page.waitForFunction(() => window.__game.map.isOpen);
  await sj_page.click('.map__marker >> nth=1');
  await sj_page.waitForFunction(() => !window.__game.map.isOpen);
  sj_steps.push('map quick travel: ok');

  // Classic page view opens and closes; Escape closes it without opening the menu.
  await sj_page.evaluate(() => window.__game.classic.open());
  await sj_page.waitForSelector('.classic:not([hidden])');
  await sj_page.click('.classic__play');
  await sj_page.evaluate(() => window.__game.classic.open());
  await sj_page.keyboard.press('Escape');
  const sj_afterEscape = await sj_page.evaluate(() => ({
    classic: window.__game.classic.isOpen,
    menu: window.__game.menu.isOpen,
  }));
  if (sj_afterEscape.classic || sj_afterEscape.menu) throw new Error('Escape from the page view');
  sj_steps.push('classic view: ok');

  // Dragging on the canvas orbits the camera (the HUD layer must let it through).
  await sj_closePanels();
  await sj_page.waitForFunction(() => !window.__valley.uiBlocking);
  await sj_page.waitForTimeout(500);
  const sj_yaw0 = await sj_page.evaluate(() => window.__valley.rig.targetYaw);
  await sj_page.mouse.move(480, 300);
  await sj_page.mouse.down();
  await sj_page.mouse.move(640, 310, { steps: 8 });
  await sj_page.mouse.up();
  const sj_yaw1 = await sj_page.evaluate(() => window.__valley.rig.targetYaw);
  if (Math.abs(sj_yaw1 - sj_yaw0) < 0.05) throw new Error('mouse drag did not orbit the camera');
  sj_steps.push('mouse orbit: ok');

  // Space still jumps right after a panel was closed (focus must not stay on its buttons).
  await sj_page.evaluate(() => window.__game.menu.open());
  await sj_page.waitForTimeout(300);
  await sj_page.evaluate(() => window.__game.menu.close());
  const sj_jumped = sj_page.evaluate(
    () =>
      new Promise((sj_resolve) => {
        window.__valley.controller.on('jump', () => sj_resolve(true));
        setTimeout(() => sj_resolve(false), 8000);
      }),
  );
  await sj_page.keyboard.press('Space');
  if (!(await sj_jumped)) throw new Error('Space did not jump after closing the menu');
  sj_steps.push('jump after panel: ok');
} catch (sj_err) {
  sj_errors.push(String(sj_err));
}

const sj_all = await sj_found().catch(() => []);
console.log(sj_steps.join('\n'));
console.log(`scrolls found: ${sj_all.length}/6 (${sj_all.join(', ')})`);
await sj_browser.close();
if (sj_errors.length || sj_all.length !== 6) {
  console.error('FAILED');
  for (const sj_e of sj_errors) console.error(' -', sj_e);
  process.exit(1);
}
console.log('PASSED');
