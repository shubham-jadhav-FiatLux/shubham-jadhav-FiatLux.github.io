/**
 * The master plan of the valley. Everything that needs to agree on *where* things are
 * (terrain carving, path painting, colliders, landmarks, zones, the map) reads from here.
 *
 * Coordinates are metres: +x = east, +z = south, +y = up. Water level is y = 0.
 */

export const WATER_LEVEL = 0;

/** Terrain grid: TERRAIN_RES vertices per side spanning TERRAIN_SIZE metres. */
export const TERRAIN_SIZE = 260;
export const TERRAIN_RES = 257;
export const TERRAIN_ORIGIN = -TERRAIN_SIZE / 2;

/** Playable area: visitors are gently kept inside this ellipse. */
export const PLAY_AREA = { x: 0, z: -2, rx: 80, rz: 74 };

export type Vec2 = readonly [number, number];

export interface Place {
  readonly x: number;
  readonly z: number;
}

export const PLACES = {
  spawn: { x: 0, z: 61 },
  gate: { x: 0, z: 50 },
  crossroads: { x: 0, z: 22 },
  training: { x: -38, z: 15 },
  pavilion: { x: 11.5, z: 2.5 },
  bridgeSouth: { x: 32, z: 12.5 },
  bridgeNorth: { x: 26, z: -24.5 },
  pagoda: { x: -20, z: -50 },
  bell: { x: 37, z: -35 },
  waterfall: { x: 50, z: -31 },
  village: { x: 32, z: 38 },
} as const satisfies Record<string, Place>;

export interface Ellipse {
  x: number;
  z: number;
  rx: number;
  rz: number;
  /** rotation in radians */
  rot: number;
}

/** The lake is the smooth union of these ellipses (main basin + waterfall pool). */
export const LAKE_ELLIPSES: readonly Ellipse[] = [
  { x: 28, z: -6, rx: 22, rz: 17, rot: 0.2 },
  { x: 43, z: -24, rx: 11, rz: 8.5, rot: -0.4 },
];

/**
 * A plateau in the north-east. It is the inside of a very large circle, so its edge is a
 * long, gently curving escarpment; where it meets the lake it becomes the waterfall cliff.
 */
export const CLIFF = { x: 95, z: -75, radius: 63, edge: 5, height: 13 };

/** The pagoda stands on this round hill. */
export const PAGODA_HILL = { x: -20, z: -50, radius: 30, plateau: 0.32, height: 10 };

/** Valley rim: hills rise outside this ellipse. */
export const RIM = { x: 0, z: -2, rx: 86, rz: 80 };

export interface FlatZone {
  x: number;
  z: number;
  /** fully flat inside this radius */
  radius: number;
  /** blend distance outside the radius */
  falloff: number;
}

/** Areas levelled so buildings and plazas sit nicely. Height = terrain height at centre. */
export const FLAT_ZONES: readonly FlatZone[] = [
  { x: 0, z: 50, radius: 6, falloff: 6 },
  { x: 0, z: 22, radius: 8, falloff: 6 },
  { x: -38, z: 15, radius: 13, falloff: 7 },
  { x: 32, z: 38, radius: 15, falloff: 8 },
  { x: 37, z: -35, radius: 4, falloff: 4 },
];

export type Surface = 'grass' | 'dirt' | 'stone' | 'wood' | 'water' | 'sand';

export interface PathDef {
  id: string;
  width: number;
  points: readonly Vec2[];
}

/** Dirt paths painted onto the terrain. They also suppress grass. */
export const PATHS: readonly PathDef[] = [
  {
    id: 'main',
    width: 3.2,
    points: [
      [0, 72],
      [0, 61],
      [0, 50],
      [-1.2, 40],
      [0.8, 30],
      [0, 22],
    ],
  },
  {
    id: 'training',
    width: 2.6,
    points: [
      [0, 22],
      [-8, 21.5],
      [-18, 19],
      [-27, 16.5],
      [-38, 15],
    ],
  },
  {
    id: 'pavilion',
    width: 2.2,
    points: [
      [0, 22],
      [4.5, 15.5],
      [8.5, 8.5],
      [11.5, 2.5],
    ],
  },
  {
    id: 'lake-south',
    width: 2.4,
    points: [
      [0, 22],
      [10, 18.5],
      [20, 15.5],
      [27, 13.5],
      [32, 12.5],
    ],
  },
  {
    id: 'village',
    width: 2.6,
    points: [
      [0.5, 36],
      [10, 38],
      [20, 38.5],
      [28, 38],
      [36, 39],
      [46, 38],
    ],
  },
  {
    id: 'pagoda',
    width: 2.6,
    points: [
      [0, 22],
      [-3, 10],
      [-6, -2],
      [-9, -14],
      [-13, -26],
      [-16, -35],
      [-18.5, -43],
      [-20, -50],
    ],
  },
  {
    id: 'north-shore',
    width: 2.2,
    points: [
      [-14, -42],
      [-3, -39],
      [9, -34],
      [19, -28.5],
      [26, -24.5],
      [31, -30],
      [37, -35],
    ],
  },
];

export interface Plaza {
  x: number;
  z: number;
  radius: number;
  surface: 'stone' | 'dirt';
}

export const PLAZAS: readonly Plaza[] = [
  { x: 0, z: 50, radius: 5.5, surface: 'stone' },
  { x: 0, z: 22, radius: 7, surface: 'stone' },
  { x: -38, z: 15, radius: 12, surface: 'dirt' },
  { x: -20, z: -50, radius: 9.5, surface: 'stone' },
  { x: 37, z: -35, radius: 3.8, surface: 'stone' },
  { x: 32, z: 38, radius: 9, surface: 'dirt' },
];
