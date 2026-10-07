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

/**
 * Which way the round buildings turn (radians about +y). The tea pavilion opens onto the
 * path from the crossroads on one side and onto the lake on the other; the bell tower
 * hangs its log striker across the line of sight of a visitor arriving along the north
 * shore, so its swing into the bell is seen side on.
 */
export const PAVILION_ROT = -1.511;
export const BELL_ROT = 0.6 - Math.PI / 2;

export interface Ellipse {
  x: number;
  z: number;
  rx: number;
  rz: number;
  /** rotation in radians */
  rot: number;
}

/**
 * A plateau in the north-east. It is the inside of a very large circle, so its edge is a
 * long, gently curving escarpment; where it meets the lake it becomes the waterfall cliff.
 */
export const CLIFF = { x: 95, z: -75, radius: 63, edge: 5, height: 13 };

/**
 * The waterfall. A stream crosses the plateau and leaves it at the `lip`; below, the
 * cliff steps back into a steep rock alcove and the water lands at the `foot`, in a deep
 * plunge pool that drains into the lake. Everything is measured along `dir`, the line
 * from the plateau centre through PLACES.waterfall.
 */
export const FALLS = (() => {
  const dx = PLACES.waterfall.x - CLIFF.x;
  const dz = PLACES.waterfall.z - CLIFF.z;
  const len = Math.hypot(dx, dz);
  const dir = { x: dx / len, z: dz / len };
  /** how far the cliff face steps back behind the falls (m) */
  const recess = 2.5;
  /** width of the cliff face at the falls (m); the rest of the escarpment uses CLIFF.edge */
  const edge = 3;
  const at = (r: number) => ({ x: CLIFF.x + dir.x * r, z: CLIFF.z + dir.z * r });
  return {
    dir,
    /** perpendicular to dir, across the falls */
    across: { x: -dir.z, z: dir.x },
    recess,
    edge,
    /** half-width of the alcove around the fall line (m) */
    alcoveHalfWidth: 6,
    /** where the stream pours over the edge */
    lip: at(CLIFF.radius - recess - edge),
    /** where the falling water meets the pool, a few metres out from the face */
    foot: at(CLIFF.radius - recess - edge + 3),
    /** centre of the plunge pool; its edge meets the foot of the cliff face */
    pool: at(CLIFF.radius - recess - edge + 1 + 6.6),
  };
})();

/** The lake is the smooth union of these ellipses: main basin, lagoon and plunge pool. */
export const LAKE_ELLIPSES: readonly Ellipse[] = [
  { x: 28, z: -6, rx: 22, rz: 17, rot: 0.2 },
  { x: 43, z: -24, rx: 10.5, rz: 8, rot: -0.4 },
  {
    x: FALLS.pool.x,
    z: FALLS.pool.z,
    rx: 6.6,
    rz: 5.6,
    rot: Math.atan2(FALLS.dir.z, FALLS.dir.x),
  },
];

/**
 * The stream on the plateau, from its spring in the hills to the waterfall lip
 * (a coarse centre line; the terrain and the water mesh smooth it).
 */
export const RIVER: readonly Vec2[] = [
  [61.5, -65],
  [60.4, -59.5],
  [60.8, -53.5],
  [60.1, -47.8],
  [58.3, -42.6],
  [56.3, -38.2],
  [FALLS.lip.x, FALLS.lip.z],
];

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

export interface HouseDef {
  x: number;
  z: number;
  /** rotation around Y; the front door faces local +z */
  rot: number;
  width: number;
  depth: number;
  style: 'house' | 'teahouse' | 'hall';
}

/** Village houses and the training hall. */
export const HOUSES: readonly HouseDef[] = [
  { x: 23, z: 30.5, rot: 0.12, width: 6.4, depth: 4.6, style: 'house' },
  { x: 40.5, z: 30, rot: -0.1, width: 5.6, depth: 4.4, style: 'house' },
  { x: 24.5, z: 46.5, rot: Math.PI + 0.05, width: 6.8, depth: 4.8, style: 'teahouse' },
  { x: 41, z: 46.5, rot: Math.PI - 0.08, width: 6, depth: 4.6, style: 'house' },
  { x: -47.5, z: 5.5, rot: 0.8, width: 6, depth: 4.4, style: 'hall' },
];

/** Zig-zag bridge centre line across the lake (south shore → north shore). */
export const BRIDGE_POINTS: readonly Vec2[] = [
  [32, 12.5],
  [31, 7],
  [26.5, 3],
  [31, -3],
  [26, -8],
  [30.5, -13.5],
  [25.5, -18.5],
  [26, -24.5],
];

export interface Circle {
  x: number;
  z: number;
  r: number;
}

/** Areas kept clear of trees, bamboo and rocks. */
export const RESERVED: readonly Circle[] = [
  { x: 0, z: 61, r: 4 },
  { x: 0, z: 50, r: 8 },
  { x: 0, z: 22, r: 9 },
  { x: -38, z: 15, r: 14 },
  { x: 11.5, z: 2.5, r: 7 },
  { x: 32, z: 38, r: 10 },
  { x: -20, z: -50, r: 11.5 },
  { x: 37, z: -35, r: 5.5 },
  ...HOUSES.map((h) => ({ x: h.x, z: h.z, r: Math.hypot(h.width, h.depth) / 2 + 2 })),
];

/** Where quick travel drops the panda for each section, and which way it faces. */
export const TRAVEL_POINTS = {
  welcome: { x: 0, z: 56.5, yaw: Math.PI },
  about: { x: 8.2, z: 8, yaw: 2.6 },
  skills: { x: -29.5, z: 16.5, yaw: -2.3 },
  journey: { x: 32.4, z: 14.8, yaw: Math.PI },
  projects: { x: -2.2, z: 10.5, yaw: Math.PI + 0.25 },
  contact: { x: 33.6, z: -31.2, yaw: 2.45 },
} as const;
