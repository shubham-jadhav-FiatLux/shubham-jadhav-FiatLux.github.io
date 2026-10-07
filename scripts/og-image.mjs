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

const sj_url = process.argv[2] ?? 'http://localhost:5173/';
const sj_out = fileURLToPath(new URL('../public/og-image.jpg', import.meta.url));

const sj_browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const sj_page = await sj_browser.newPage({ viewport: { width: 1200, height: 630 } });
sj_page.setDefaultTimeout(240_000);

const sj_sep = sj_url.includes('?') ? '&' : '?';
await sj_page.goto(`${sj_url}${sj_sep}quality=high&adaptive=0`);
await sj_page.waitForSelector('.loader--ready');
await sj_page.addStyleTag({ content: '.hud, .touch, .toasts { display: none !important; }' });
await sj_page.click('.loader__begin');
await sj_page.waitForTimeout(1500);

// Let the opening camera flight finish, then hold a high view over the whole valley:
// village in front, the lake and bridge, the waterfall and the pagoda on its hill, and
// the peaks rising out of the mist behind.
await sj_page.waitForTimeout(3500);
await sj_page.evaluate(
  ([sj_pos, sj_target]) => {
    const sj_app = window.__valley;
    window.__game?.progress.reset();
    const sj_cam = sj_app.rig.camera;
    sj_app.rig.playShot(
      {
        position: sj_cam.position.clone().set(...sj_pos),
        target: sj_cam.position.clone().set(...sj_target),
      },
      0.01,
    );
    sj_app.input.lastActivity = performance.now();
  },
  [
    [62, 40, 76],
    [8, 9, -20],
  ],
);
await sj_page.waitForTimeout(Number(process.env.SETTLE ?? 5000));

await sj_page.evaluate(() => {
  const sj_c = window.__valley.content;
  const sj_named = !sj_c.owner.name.includes('[');
  const sj_el = document.createElement('div');
  sj_el.innerHTML = `
    <div class="seal seal--lg"></div>
    <div class="og__title"></div>
    <div class="og__tagline"></div>
    ${sj_named ? '<div class="og__owner"></div>' : ''}`;
  sj_el.querySelector('.seal').textContent = sj_c.site.seal;
  sj_el.querySelector('.og__title').textContent = sj_c.site.title;
  sj_el.querySelector('.og__tagline').textContent = sj_c.site.tagline;
  if (sj_named)
    sj_el.querySelector('.og__owner').textContent = `${sj_c.owner.name} · ${sj_c.owner.role}`;
  sj_el.style.cssText = `position: fixed; inset: 0; z-index: 999; display: flex;
    flex-direction: column; justify-content: center; align-items: flex-start; gap: 14px;
    padding: 0 0 0 70px; pointer-events: none;
    background: linear-gradient(90deg, rgba(243, 234, 214, 0.95) 0%,
      rgba(243, 234, 214, 0.82) 30%, rgba(243, 234, 214, 0.35) 48%, rgba(243, 234, 214, 0) 62%);`;
  const sj_style = document.createElement('style');
  sj_style.textContent = `
    .og__title { max-width: 560px; font-family: var(--font-brush); font-size: 82px;
      line-height: 1.02; color: var(--ink); }
    .og__tagline { font-family: var(--font-display); font-style: italic; font-size: 32px;
      color: var(--ink-soft); }
    .og__owner { margin-top: 6px; font-family: var(--font-display); font-weight: 700;
      font-size: 20px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--seal-dark); }`;
  document.head.appendChild(sj_style);
  document.body.appendChild(sj_el);
});
await sj_page.waitForTimeout(400);
await sj_page.screenshot({ path: sj_out, type: 'jpeg', quality: 86 });
console.log('wrote', sj_out);
await sj_browser.close();
