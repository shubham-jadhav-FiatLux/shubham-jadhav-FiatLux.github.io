#!/usr/bin/env node
/**
 * Captures reference screenshots of the valley with a headless browser.
 *
 *   npm run dev            # in one terminal
 *   npm run shots          # in another  (or: node scripts/screenshots.mjs <url> [shotName...])
 *
 * Uses playwright-core with the locally installed Chromium (set CHROMIUM_PATH to override).
 * Output goes to ./screenshots/.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const only = process.argv.slice(3);
const outDir = new URL('../screenshots/', import.meta.url);
mkdirSync(outDir, { recursive: true });

/** Each shot places the panda and the follow camera. */
const SHOTS = [
  { name: 'title', title: true },
  { name: 'spawn', x: 0, z: 58, yaw: Math.PI, cam: { yaw: 0.25, pitch: 0.32, distance: 10 } },
  { name: 'panda-front', x: 0, z: 40, yaw: 0, cam: { yaw: 0.35, pitch: 0.18, distance: 4.2 } },
  { name: 'crossroads', x: 2, z: 30, yaw: Math.PI, cam: { yaw: -0.2, pitch: 0.35, distance: 12 } },
  { name: 'lake', x: 14, z: 16, yaw: 2.4, cam: { yaw: -0.6, pitch: 0.3, distance: 14 } },
  { name: 'training', x: -30, z: 22, yaw: -2.2, cam: { yaw: 0.9, pitch: 0.35, distance: 13 } },
  { name: 'pagoda', x: -12, z: -28, yaw: Math.PI, cam: { yaw: 0.2, pitch: 0.28, distance: 14 } },
  { name: 'waterfall', x: 30, z: -24, yaw: 2.3, cam: { yaw: -0.9, pitch: 0.22, distance: 12 } },
  { name: 'gate', x: 0, z: 57, yaw: Math.PI, cam: { yaw: 0.35, pitch: 0.2, distance: 11 } },
  {
    name: 'pagoda-top',
    x: -17,
    z: -38,
    yaw: Math.PI,
    cam: { yaw: 0.25, pitch: 0.12, distance: 16 },
  },
  { name: 'pavilion', x: 8, z: 9, yaw: 2.6, cam: { yaw: -0.3, pitch: 0.3, distance: 12 } },
  { name: 'village', x: 30, z: 40, yaw: Math.PI, cam: { yaw: 0.2, pitch: 0.3, distance: 16 } },
  { name: 'bridge', x: 31, z: 9, yaw: Math.PI, cam: { yaw: 0.5, pitch: 0.35, distance: 13 } },
  { name: 'bell', x: 33, z: -30, yaw: 2.3, cam: { yaw: -0.6, pitch: 0.25, distance: 11 } },
  { name: 'dummies', x: -36, z: 18, yaw: -0.3, cam: { yaw: 0.3, pitch: 0.3, distance: 11 } },
  { name: 'vista', x: 2, z: 30, yaw: Math.PI, cam: { yaw: 0.15, pitch: 0.42, distance: 20 } },
  { name: 'falls', x: 38, z: -20, yaw: 2.4, cam: { yaw: -0.75, pitch: 0.12, distance: 14 } },
  { name: 'banners', x: -4, z: 4, yaw: Math.PI, cam: { yaw: 0.1, pitch: 0.28, distance: 12 } },
  // Close-ups for art direction
  { name: 'bamboo', x: -3.5, z: 51, yaw: -1.3, cam: { yaw: 1.2, pitch: 0.18, distance: 7 } },
  { name: 'lantern', x: 0, z: 54.5, yaw: Math.PI, cam: { yaw: 0.35, pitch: 0.12, distance: 6.5 } },
  { name: 'rocks', x: 4.2, z: 10.5, yaw: 2.6, cam: { yaw: 0.2, pitch: 0.2, distance: 6 } },
  { name: 'path-edge', x: 1, z: 36, yaw: Math.PI, cam: { yaw: 0.25, pitch: 0.28, distance: 7 } },
  { name: 'bridge-deck', x: 31.2, z: 9, yaw: Math.PI, cam: { yaw: 0.4, pitch: 0.3, distance: 8 } },
  { name: 'falls-pool', x: 40, z: -19, yaw: 2.4, cam: { yaw: -0.8, pitch: 0.16, distance: 16 } },
  { name: 'falls-high', x: 36, z: -14, yaw: 2.4, cam: { yaw: -0.6, pitch: 0.62, distance: 20 } },
  // UI states (the `action` runs in the page after placing the panda)
  { name: 'hud', x: 0, z: 58, yaw: Math.PI, cam: { yaw: 0.25, pitch: 0.32, distance: 10 } },
  {
    name: 'discover',
    x: 9.5,
    z: 5,
    yaw: 2.6,
    cam: { yaw: -0.4, pitch: 0.3, distance: 9 },
    // let the follow camera arrive first, then catch the ceremony mid-flight
    actionDelay: 2500,
    action: "window.__game.onTrigger(window.__game.zones.find('about'))",
    settle: 1100,
  },
  {
    name: 'scroll',
    x: 9.5,
    z: 5,
    yaw: 2.6,
    cam: { yaw: -0.4, pitch: 0.3, distance: 9 },
    action: "window.__game.progress.discover('about'); window.__game.scroll.open('about')",
    settle: 2000,
  },
  {
    name: 'map',
    x: 2,
    z: 30,
    yaw: Math.PI,
    cam: { yaw: 0.2, pitch: 0.3, distance: 10 },
    action: 'window.__game.map.open()',
    settle: 4000,
  },
  {
    name: 'classic',
    x: 2,
    z: 30,
    yaw: Math.PI,
    cam: { yaw: 0.2, pitch: 0.3, distance: 10 },
    action: 'window.__game.classic.open()',
    settle: 800,
  },
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180_000);
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text());
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

const sep = url.includes('?') ? '&' : '?';
await page.goto(`${url}${sep}quality=${process.env.QUALITY ?? 'high'}&adaptive=0`);
await page.waitForSelector('.loader--ready', { timeout: 180_000 });
// Software rendering is slow: skip UI transitions so captures show the final state.
await page.addStyleTag({
  content:
    '.overlay, .hud, .map, .menu, .scroll__paper, .scroll__roller { transition: none !important; }',
});
await page.waitForTimeout(1500);

for (const shot of SHOTS) {
  if (only.length && !only.includes(shot.name)) continue;
  if (shot.title) {
    await page.screenshot({ path: new URL(`${shot.name}.png`, outDir).pathname });
    console.log('captured', shot.name);
    continue;
  }
  await page.evaluate((s) => {
    const app = window.__valley;
    if (!app.started) {
      document.querySelector('.loader__begin')?.click();
    }
    app.controller.teleport(s.x, s.z, s.yaw);
    app.scarf.snap();
    app.rig.startFollow(app.controller.position, s.yaw, 0.01);
    app.rig.targetYaw = app.rig.yaw = s.cam.yaw;
    app.rig.targetPitch = app.rig.pitch = s.cam.pitch;
    app.rig.targetDistance = app.rig.distance = s.cam.distance;
    app.input.lastActivity = performance.now();
    const g = window.__game;
    if (g) {
      g.scroll.close();
      g.map.close();
      g.menu.close();
      if (g.classic.isOpen) g.classic.close();
    }
  }, shot);
  if (shot.action) {
    await page.waitForTimeout(shot.actionDelay ?? 0);
    await page.evaluate((code) => new Function(code)(), shot.action);
  }
  await page.waitForTimeout(shot.settle ?? Number(process.env.SETTLE ?? 2500));
  await page.screenshot({ path: new URL(`${shot.name}.png`, outDir).pathname });
  console.log('captured', shot.name);
}

await browser.close();
