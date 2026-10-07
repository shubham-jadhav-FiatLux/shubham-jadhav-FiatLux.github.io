import { describe, expect, it } from 'vitest';
import { sj_FINISH_ID, sj_PAL, finishFor } from '../src/world/architecture/palette';

describe('architecture finishes', () => {
  it('derives the finish from the palette colour', () => {
    expect(finishFor(sj_PAL.stone)).toBe('stone');
    expect(finishFor(sj_PAL.stoneDark)).toBe('stone');
    expect(finishFor(sj_PAL.wood)).toBe('wood');
    expect(finishFor(sj_PAL.woodDeck)).toBe('wood');
    expect(finishFor(sj_PAL.gold)).toBe('metal');
    expect(finishFor(sj_PAL.vermilion)).toBe('paint');
  });

  it('ignores letter case and falls back to paint', () => {
    expect(finishFor(sj_PAL.wood.toUpperCase())).toBe('wood');
    expect(finishFor('#123456')).toBe('paint');
    expect(finishFor(null)).toBe('paint');
    expect(finishFor(0xffffff)).toBe('paint');
  });

  it('gives every finish its own shader id', () => {
    const sj_ids = Object.values(sj_FINISH_ID);
    expect(new Set(sj_ids).size).toBe(sj_ids.length);
  });
});
