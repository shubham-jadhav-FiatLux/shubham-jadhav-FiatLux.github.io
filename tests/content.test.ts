import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { portfolio } from '../src/content/portfolio';

const subsetScript = readFileSync(new URL('../scripts/subset-font.py', import.meta.url), 'utf-8');
const cjk = /CJK = "([^"]+)"/.exec(subsetScript)?.[1] ?? '';

describe('portfolio content', () => {
  it('has unique project ids', () => {
    const ids = portfolio.projects.items.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('stays within what the valley can display', () => {
    expect(portfolio.projects.items.length).toBeGreaterThan(0);
    expect(portfolio.projects.items.length).toBeLessThanOrEqual(8);
    expect(portfolio.skills.groups.length).toBeLessThanOrEqual(6);
    expect(portfolio.journey.entries.length).toBeLessThanOrEqual(8);
  });

  it('uses absolute links', () => {
    const links = [
      ...portfolio.contact.links,
      ...portfolio.projects.items.flatMap((p) => p.links ?? []),
    ];
    for (const l of links) expect(l.url, l.label).toMatch(/^(https?:|mailto:)/);
  });

  it('only uses gate glyphs that exist in the brush font subset', () => {
    for (const ch of portfolio.site.gateGlyphs) expect(cjk, ch).toContain(ch);
  });
});
