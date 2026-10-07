import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { sj_portfolio } from '../src/content/portfolio';

const sj_subsetScript = readFileSync(
  new URL('../scripts/subset-font.py', import.meta.url),
  'utf-8',
);
const sj_cjk = /CJK = "([^"]+)"/.exec(sj_subsetScript)?.[1] ?? '';

describe('portfolio content', () => {
  it('has unique project ids', () => {
    const sj_ids = sj_portfolio.projects.items.map((sj_p) => sj_p.id);
    expect(new Set(sj_ids).size).toBe(sj_ids.length);
  });

  it('stays within what the valley can display', () => {
    expect(sj_portfolio.projects.items.length).toBeGreaterThan(0);
    expect(sj_portfolio.projects.items.length).toBeLessThanOrEqual(8);
    expect(sj_portfolio.skills.groups.length).toBeLessThanOrEqual(6);
    expect(sj_portfolio.journey.entries.length).toBeLessThanOrEqual(8);
  });

  it('uses absolute links', () => {
    const sj_links = [
      ...sj_portfolio.contact.links,
      ...sj_portfolio.projects.items.flatMap((sj_p) => sj_p.links ?? []),
    ];
    for (const sj_l of sj_links) expect(sj_l.url, sj_l.label).toMatch(/^(https?:|mailto:)/);
  });

  it('only uses gate glyphs that exist in the brush font subset', () => {
    for (const sj_ch of sj_portfolio.site.gateGlyphs) expect(sj_cjk, sj_ch).toContain(sj_ch);
  });
});
