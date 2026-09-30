#!/usr/bin/env node
/**
 * Renders the link-preview image (Open Graph / Twitter card) from the live scene:
 * a view over the valley with the site title painted on the left.
 *
 *   npm run dev              # in one terminal
 *   npm run og-image         # writes public/og-image.jpg (1200 × 630)
 *
 * Re-run it after filling in your name so the preview shows it too.
 */
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';

const url = process.argv[2] ?? 'http://localhost:5173/';
const out = fileURLToPath(new URL('../public/og-image.jpg', import.meta.url));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
page.setDefaultTimeout(240_000);

const sep = url.includes('?') ? '&' : '?';
await page.goto(`${url}${sep}quality=high&adaptive=0`);
await page.waitForSelector('.loader--ready');
await page.addStyleTag({ content: '.hud, .touch, .toasts { display: none !important; }' });
await page.click('.loader__begin');
await page.waitForTimeout(1500);

// Let the opening camera flight finish, then hold a high view over the whole valley:
// village in front, the lake and bridge, the waterfall and the pagoda on its hill.
await page.waitForTimeout(3500);
await page.evaluate(
  ([pos, target]) => {
    const app = window.__valley;
    window.__game?.progress.reset();
    const cam = app.rig.camera;
    app.rig.playShot(
      { position: cam.position.clone().set(...pos), target: cam.position.clone().set(...target) },
      0.01,
    );
    app.input.lastActivity = performance.now();
  },
  [
    [62, 44, 76],
    [10, 2, -14],
  ],
);
await page.waitForTimeout(Number(process.env.SETTLE ?? 5000));

await page.evaluate(() => {
  const c = window.__valley.content;
  const named = !c.owner.name.includes('[');
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="seal seal--lg">竹</div>
    <div class="og__title"></div>
    <div class="og__tagline"></div>
    ${named ? '<div class="og__owner"></div>' : ''}`;
  el.querySelector('.og__title').textContent = c.site.title;
  el.querySelector('.og__tagline').textContent = c.site.tagline;
  if (named) el.querySelector('.og__owner').textContent = `${c.owner.name} · ${c.owner.role}`;
  el.style.cssText = `position: fixed; inset: 0; z-index: 999; display: flex;
    flex-direction: column; justify-content: center; align-items: flex-start; gap: 14px;
    padding: 0 0 0 70px; pointer-events: none;
    background: linear-gradient(90deg, rgba(243, 234, 214, 0.95) 0%,
      rgba(243, 234, 214, 0.82) 30%, rgba(243, 234, 214, 0.35) 48%, rgba(243, 234, 214, 0) 62%);`;
  const style = document.createElement('style');
  style.textContent = `
    .og__title { max-width: 560px; font-family: var(--font-brush); font-size: 82px;
      line-height: 1.02; color: var(--ink); }
    .og__tagline { font-family: var(--font-display); font-style: italic; font-size: 32px;
      color: var(--ink-soft); }
    .og__owner { margin-top: 6px; font-family: var(--font-display); font-weight: 700;
      font-size: 20px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--seal-dark); }`;
  document.head.appendChild(style);
  document.body.appendChild(el);
});
await page.waitForTimeout(400);
await page.screenshot({ path: out, type: 'jpeg', quality: 86 });
console.log('wrote', out);
await browser.close();
