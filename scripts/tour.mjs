#!/usr/bin/env node
/**
 * Plays "Watch the tour" from start to finish in a headless browser, fast-forwarded,
 * and checks that every chapter ran, every scroll was found and nothing threw. Takes a
 * screenshot every few seconds as a contact sheet of the film.
 *
 *   npm run dev              # in one terminal
 *   node scripts/tour.mjs [url] [--sim 8] [--every 4] [--quality low] [--no-shots]
 *
 * `--sim` runs that many simulation steps per rendered frame (software rendering is slow).
 * Screenshots go to ./screenshots/tour/.
 */
import { chromium } from 'playwright-core';
import { mkdirSync, rmSync } from 'node:fs';

const flags = {};
const positional = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--no-shots') flags['no-shots'] = true;
  else if (a.startsWith('--')) flags[a.slice(2)] = process.argv[++i];
  else positional.push(a);
}
const flag = (name, fallback) => flags[name] ?? fallback;
const url = positional[0] ?? 'http://localhost:5173/';
const sim = Number(flag('sim', '8'));
const every = Number(flag('every', '4')) * 1000;
const quality = flag('quality', 'low');
const shots = !flags['no-shots'];
const outDir = new URL('../screenshots/tour/', import.meta.url);
if (shots) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.setDefaultTimeout(240_000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

const sep = url.includes('?') ? '&' : '?';
await page.goto(`${url}${sep}quality=${quality}&adaptive=0&sim=${sim}&tour`);
await page.waitForSelector('.loader--ready', { timeout: 240_000 });
await page.evaluate(() => window.__game.progress.reset());
await page.click('.loader__tour');

const t0 = Date.now();
const seen = new Set();
let n = 0;
let last = 0;
for (;;) {
  const state = await page.evaluate(() => {
    const t = window.__game.tour;
    return {
      running: t.running,
      chapter: t.chapter,
      time: t.timeline.now,
      ended: document.querySelector('.tour')?.classList.contains('tour--ended') ?? false,
    };
  });
  seen.add(state.chapter);
  if (shots && Date.now() - last >= every) {
    last = Date.now();
    const name = `${String(n++).padStart(3, '0')}-c${state.chapter}-t${state.time.toFixed(0)}.png`;
    await page.screenshot({ path: new URL(name, outDir).pathname });
  }
  if (state.ended || !state.running) break;
  // software rendering can be very slow: allow up to 90 minutes for the whole film
  if (Date.now() - t0 > 90 * 60_000) {
    errors.push('tour did not finish in time');
    break;
  }
  await page.waitForTimeout(500);
}
if (shots)
  await page.screenshot({
    path: new URL(`${String(n).padStart(3, '0')}-end.png`, outDir).pathname,
  });

const result = await page.evaluate(() => ({
  found: window.__game.progress.all,
  time: window.__game.tour.timeline.now,
}));
const chapters = [...seen].filter((c) => c >= 0).sort((a, b) => a - b);
console.log(`chapters seen: ${chapters.join(', ')}`);
console.log(`scrolls found: ${result.found.length}/6 (${result.found.join(', ')})`);
console.log(
  `film length: ${result.time.toFixed(0)} s of tour time, ${((Date.now() - t0) / 1000).toFixed(0)} s real`,
);

// Hand the controls back and make sure the panda walks again.
await page.click('[data-end="explore"]');
await page.waitForTimeout(800);
const free = await page.evaluate(() => ({
  running: window.__game.tour.running,
  driver: window.__valley.driver !== null,
}));
if (free.running || free.driver) errors.push('the tour did not hand back the controls');

await browser.close();
const ok = errors.length === 0 && result.found.length === 6 && chapters.length >= 8;
if (!ok) {
  console.log('FAILED');
  for (const e of errors) console.log(' -', e);
  process.exit(1);
}
console.log('PASSED');
