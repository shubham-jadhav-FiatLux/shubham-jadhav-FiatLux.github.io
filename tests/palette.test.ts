import { describe, expect, it } from 'vitest';
import { FINISH_ID, PAL, finishFor } from '../src/world/architecture/palette';

describe('architecture finishes', () => {
  it('derives the finish from the palette colour', () => {
    expect(finishFor(PAL.stone)).toBe('stone');
    expect(finishFor(PAL.stoneDark)).toBe('stone');
    expect(finishFor(PAL.wood)).toBe('wood');
    expect(finishFor(PAL.woodDeck)).toBe('wood');
    expect(finishFor(PAL.gold)).toBe('metal');
    expect(finishFor(PAL.vermilion)).toBe('paint');
  });

  it('ignores letter case and falls back to paint', () => {
    expect(finishFor(PAL.wood.toUpperCase())).toBe('wood');
    expect(finishFor('#123456')).toBe('paint');
    expect(finishFor(null)).toBe('paint');
    expect(finishFor(0xffffff)).toBe('paint');
  });

  it('gives every finish its own shader id', () => {
    const ids = Object.values(FINISH_ID);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
