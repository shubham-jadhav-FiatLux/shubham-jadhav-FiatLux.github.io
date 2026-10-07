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

const sj_flags = {};
const sj_positional = [];
for (let sj_i = 2; sj_i < process.argv.length; sj_i++) {
  const sj_a = process.argv[sj_i];
  if (sj_a === '--no-shots') sj_flags['no-shots'] = true;
  else if (sj_a.startsWith('--')) sj_flags[sj_a.slice(2)] = process.argv[++sj_i];
  else sj_positional.push(sj_a);
}
const sj_flag = (sj_name, sj_fallback) => sj_flags[sj_name] ?? sj_fallback;
const sj_url = sj_positional[0] ?? 'http://localhost:5173/';
const sj_sim = Number(sj_flag('sim', '8'));
const sj_every = Number(sj_flag('every', '4')) * 1000;
const sj_quality = sj_flag('quality', 'low');
const sj_shots = !sj_flags['no-shots'];
const sj_outDir = new URL('../screenshots/tour/', import.meta.url);
if (sj_shots) {
  rmSync(sj_outDir, { recursive: true, force: true });
  mkdirSync(sj_outDir, { recursive: true });
}

const sj_browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const sj_page = await sj_browser.newPage({ viewport: { width: 960, height: 540 } });
sj_page.setDefaultTimeout(240_000);
const sj_errors = [];
sj_page.on('pageerror', (sj_e) => sj_errors.push(sj_e.message));
sj_page.on('console', (sj_m) => {
  if (sj_m.type() === 'error') sj_errors.push(sj_m.text());
});

const sj_sep = sj_url.includes('?') ? '&' : '?';
await sj_page.goto(`${sj_url}${sj_sep}quality=${sj_quality}&adaptive=0&sim=${sj_sim}&tour`);
await sj_page.waitForSelector('.loader--ready', { timeout: 240_000 });
await sj_page.evaluate(() => window.__game.progress.reset());
await sj_page.click('.loader__tour');

const sj_t0 = Date.now();
const sj_seen = new Set();
let sj_n = 0;
let sj_last = 0;
for (;;) {
  const sj_state = await sj_page.evaluate(() => {
    const sj_t = window.__game.tour;
    return {
      running: sj_t.running,
      chapter: sj_t.chapter,
      time: sj_t.timeline.now,
      ended: document.querySelector('.tour')?.classList.contains('tour--ended') ?? false,
    };
  });
  sj_seen.add(sj_state.chapter);
  if (sj_shots && Date.now() - sj_last >= sj_every) {
    sj_last = Date.now();
    const sj_name = `${String(sj_n++).padStart(3, '0')}-c${sj_state.chapter}-t${sj_state.time.toFixed(0)}.png`;
    await sj_page.screenshot({ path: new URL(sj_name, sj_outDir).pathname });
  }
  if (sj_state.ended || !sj_state.running) break;
  // software rendering can be very slow: allow up to 90 minutes for the whole film
  if (Date.now() - sj_t0 > 90 * 60_000) {
    sj_errors.push('tour did not finish in time');
    break;
  }
  await sj_page.waitForTimeout(500);
}
if (sj_shots)
  await sj_page.screenshot({
    path: new URL(`${String(sj_n).padStart(3, '0')}-end.png`, sj_outDir).pathname,
  });

const sj_result = await sj_page.evaluate(() => ({
  found: window.__game.progress.all,
  time: window.__game.tour.timeline.now,
}));
const sj_chapters = [...sj_seen].filter((sj_c) => sj_c >= 0).sort((sj_a, sj_b) => sj_a - sj_b);
console.log(`chapters seen: ${sj_chapters.join(', ')}`);
console.log(`scrolls found: ${sj_result.found.length}/6 (${sj_result.found.join(', ')})`);
console.log(
  `film length: ${sj_result.time.toFixed(0)} s of tour time, ${((Date.now() - sj_t0) / 1000).toFixed(0)} s real`,
);

// Hand the controls back and make sure the panda walks again.
await sj_page.click('[data-end="explore"]');
await sj_page.waitForTimeout(800);
const sj_free = await sj_page.evaluate(() => ({
  running: window.__game.tour.running,
  driver: window.__valley.driver !== null,
}));
if (sj_free.running || sj_free.driver) sj_errors.push('the tour did not hand back the controls');

await sj_browser.close();
const sj_ok = sj_errors.length === 0 && sj_result.found.length === 6 && sj_chapters.length >= 8;
if (!sj_ok) {
  console.log('FAILED');
  for (const sj_e of sj_errors) console.log(' -', sj_e);
  process.exit(1);
}
console.log('PASSED');
