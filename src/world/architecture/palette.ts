import type { ColorRepresentation } from 'three';

/** Architectural palette. */
export const sj_PAL = {
  vermilion: '#a8352a',
  vermilionDark: '#7d2620',
  beamTeal: '#2f6f72',
  beamBlue: '#2f4f7a',
  gold: '#d0a445',
  plaster: '#efe4cf',
  wood: '#5a3a28',
  woodLight: '#8a5f3f',
  woodDeck: '#9a7250',
  stone: '#b3a893',
  stoneDark: '#8e8574',
  tileSlate: '#4a5561',
  tileTeal: '#2f7a6e',
  tileGreen: '#4d7a4a',
  tileGold: '#c99a3a',
  underside: '#6e3326',
  lanternRed: '#e0412b',
  paperWarm: '#ffd9a0',
  bronze: '#6f7f5c',
};

/**
 * How a part's surface is shaded (in the merged 'paint' mesh): lacquered paint with a soft
 * sheen, wood with grain along the part's long axis, stone with grain, speckles and
 * weathering, or gilded metal.
 */
export type Finish = 'paint' | 'wood' | 'stone' | 'metal';

export const sj_FINISH_ID: Record<Finish, number> = { paint: 0, wood: 1, stone: 2, metal: 3 };

const sj_BY_COLOR = new Map<string, Finish>([
  [sj_PAL.wood, 'wood'],
  [sj_PAL.woodLight, 'wood'],
  [sj_PAL.woodDeck, 'wood'],
  ['#2a1a12', 'wood'],
  ['#3a2416', 'wood'],
  ['#3a2a1c', 'wood'],
  ['#4a2a1b', 'wood'],
  ['#4e2f1f', 'wood'],
  ['#5b3a22', 'wood'],
  ['#8a5a36', 'wood'],
  ['#9c6b3e', 'wood'],
  ['#b98a55', 'wood'],
  [sj_PAL.stone, 'stone'],
  [sj_PAL.stoneDark, 'stone'],
  [sj_PAL.gold, 'metal'],
  [sj_PAL.bronze, 'metal'],
]);

/** The finish a colour implies when a part does not name one. */
export function finishFor(sj_color: ColorRepresentation | null): Finish {
  return typeof sj_color === 'string'
    ? (sj_BY_COLOR.get(sj_color.toLowerCase()) ?? 'paint')
    : 'paint';
}
