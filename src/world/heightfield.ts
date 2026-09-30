/**
 * Pure terrain height generation. No three.js, no DOM: this module is unit tested and
 * shared by the terrain mesh, the physics and every placement routine.
 */
import { clamp01, smin, smoothstep, lerp } from '../utils/math';
import { SimplexNoise } from '../utils/noise';
import {
  CLIFF,
  FALLS,
  FLAT_ZONES,
  LAKE_ELLIPSES,
  PAGODA_HILL,
  RIM,
  RIVER,
  TERRAIN_ORIGIN,
  TERRAIN_RES,
  TERRAIN_SIZE,
  WATER_LEVEL,
  type Ellipse,
  type Vec2,
} from './layout';

const noise = new SimplexNoise(20260929);

function ellipseSdf(x: number, z: number, e: Ellipse): number {
  const dx = x - e.x;
  const dz = z - e.z;
  const c = Math.cos(e.rot);
  const s = Math.sin(e.rot);
  const lx = dx * c + dz * s;
  const lz = -dx * s + dz * c;
  const q = Math.hypot(lx / e.rx, lz / e.rz);
  return (q - 1) * Math.min(e.rx, e.rz);
}

/**
 * Approximate signed distance (metres) to the lake shoreline.
 * Negative inside the water, positive on land.
 */
export function lakeSdf(x: number, z: number): number {
  let d = ellipseSdf(x, z, LAKE_ELLIPSES[0]!);
  for (let i = 1; i < LAKE_ELLIPSES.length; i++) {
    d = smin(d, ellipseSdf(x, z, LAKE_ELLIPSES[i]!), 6);
  }
  // Organic, wobbly shoreline (held steady at the foot of the falls).
  const calm = 1 - smoothstep(6, 12, Math.hypot(x - FALLS.foot.x, z - FALLS.foot.z));
  return d + noise.noise2(x * 0.08, z * 0.08) * 1.6 * (1 - 0.85 * calm);
}

/** Rolling valley floor with the rim, the pagoda hill and the waterfall cliff. */
function landHeight(x: number, z: number): number {
  // Gentle meadows.
  let h =
    1.7 + noise.fbm2(x * 0.022, z * 0.022, 4) * 1.1 + noise.fbm2(x * 0.09, z * 0.09, 2) * 0.22;
  h = Math.max(h, 0.6);

  // Valley rim: hills rise beyond the playable ellipse.
  const rr = Math.hypot((x - RIM.x) / RIM.rx, (z - RIM.z) / RIM.rz);
  const rim = smoothstep(0.8, 1.32, rr);
  if (rim > 0) {
    const ridge = noise.ridged2(x * 0.009 + 7.3, z * 0.009 - 2.1, 2);
    h += rim * (18 + ridge * 14 + noise.fbm2(x * 0.02, z * 0.02, 2) * 7);
  }

  // Pagoda hill: a smooth dome with a flat top.
  const ph = Math.hypot(x - PAGODA_HILL.x, z - PAGODA_HILL.z) / PAGODA_HILL.radius;
  if (ph < 1) {
    h += PAGODA_HILL.height * (1 - smoothstep(PAGODA_HILL.plateau, 1, ph));
  }

  // North-east plateau whose edge becomes the waterfall cliff. Around the falls the cliff
  // steps back into a steep alcove.
  const cd = Math.hypot(x - CLIFF.x, z - CLIFF.z);
  if (cd < CLIFF.radius + 1) {
    const alcove = fallsAlcove(x, z);
    const radius = CLIFF.radius - FALLS.recess * alcove;
    const edge = lerp(CLIFF.edge, FALLS.edge, alcove);
    const t = smoothstep(radius, radius - edge, cd);
    const rough = noise.fbm2(x * 0.12, z * 0.12, 2) * 1.2 * (1 - alcove * 0.6);
    h += t * (CLIFF.height + rough);
  }

  return h;
}

/** 1 on the fall line, fading to 0 at the sides of the alcove. */
function fallsAlcove(x: number, z: number): number {
  const across = Math.abs((x - CLIFF.x) * FALLS.across.x + (z - CLIFF.z) * FALLS.across.z);
  const wobble = noise.noise2(x * 0.35, z * 0.35) * 0.8;
  return 1 - smoothstep(FALLS.alcoveHalfWidth * 0.4, FALLS.alcoveHalfWidth, across + wobble);
}

/* ------------------------------------------------------------------ River */

/** Chaikin corner cutting; keeps the end points. */
function smoothLine(pts: readonly Vec2[], iterations: number): Vec2[] {
  let out = pts.slice();
  for (let k = 0; k < iterations; k++) {
    const next: Vec2[] = [out[0]!];
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i]!;
      const b = out[i + 1]!;
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    next.push(out[out.length - 1]!);
    out = next;
  }
  return out;
}

export interface RiverPoint {
  x: number;
  z: number;
  /** distance along the stream from the spring (m) */
  s: number;
  /** height of the stream bed (m) */
  bed: number;
  /** half-width of the flat bed (m) */
  halfWidth: number;
}

/** Depth of the water in the stream (m). */
export const RIVER_DEPTH = 0.42;
const RIVER_BANK = 2.4;
const SPRING_RADIUS = 3.2;

/**
 * The stream, densely sampled: its bed only ever runs downhill (a running minimum of the
 * ground along the course), so the water surface never climbs.
 */
export const riverCourse: { points: RiverPoint[]; length: number } = (() => {
  const line = smoothLine(RIVER, 3);
  // resample evenly every ~0.6 m
  const dense: Vec2[] = [];
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.6));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      dense.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
    }
  }
  dense.push(line[line.length - 1]!);
  const points: RiverPoint[] = [];
  let s = 0;
  let bed = Infinity;
  dense.forEach(([x, z], i) => {
    if (i > 0) s += Math.hypot(x - dense[i - 1]![0], z - dense[i - 1]![1]);
    points.push({ x, z, s, bed: 0, halfWidth: 0 });
  });
  const length = s;
  for (const p of points) {
    const f = p.s / length;
    p.halfWidth = lerp(0.95, 1.75, smoothstep(0, 0.7, f));
    const depth = lerp(0.9, 1.25, f);
    bed = Math.min(bed, landHeight(p.x, p.z) - depth);
    p.bed = bed;
  }
  return { points, length };
})();

const riverBox = (() => {
  const m = RIVER_BANK + 3 + SPRING_RADIUS;
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const p of riverCourse.points) {
    x0 = Math.min(x0, p.x - m);
    z0 = Math.min(z0, p.z - m);
    x1 = Math.max(x1, p.x + m);
    z1 = Math.max(z1, p.z + m);
  }
  return { x0, z0, x1, z1 };
})();

/** Closest point of the stream's centre line: distance, bed height and half-width there. */
export function riverAt(
  x: number,
  z: number,
): { dist: number; bed: number; halfWidth: number; s: number } | null {
  if (x < riverBox.x0 || x > riverBox.x1 || z < riverBox.z0 || z > riverBox.z1) return null;
  const pts = riverCourse.points;
  let best = Infinity;
  let bi = 0;
  let bt = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz;
    const t = len2 > 0 ? clamp01(((x - a.x) * abx + (z - a.z) * abz) / len2) : 0;
    const dx = x - (a.x + abx * t);
    const dz = z - (a.z + abz * t);
    const d2 = dx * dx + dz * dz;
    if (d2 < best) {
      best = d2;
      bi = i;
      bt = t;
    }
  }
  const a = pts[bi]!;
  const b = pts[bi + 1]!;
  return {
    dist: Math.sqrt(best),
    bed: lerp(a.bed, b.bed, bt),
    halfWidth: lerp(a.halfWidth, b.halfWidth, bt),
    s: lerp(a.s, b.s, bt),
  };
}

/** Cuts the stream bed (with gently sloping banks) and the spring pool into the ground. */
function applyRiver(x: number, z: number, h: number): number {
  const r = riverAt(x, z);
  if (!r) return h;
  let target = lerp(r.bed, h, smoothstep(r.halfWidth, r.halfWidth + RIVER_BANK, r.dist));
  const spring = riverCourse.points[0]!;
  const ds = Math.hypot(x - spring.x, z - spring.z);
  if (ds < SPRING_RADIUS + RIVER_BANK) {
    const bowl = lerp(spring.bed - 0.35, h, smoothstep(SPRING_RADIUS - 1, SPRING_RADIUS + 1.6, ds));
    target = Math.min(target, bowl);
  }
  return Math.min(h, target);
}

/**
 * Carves the lake basin: a shallow sandy shelf dropping to ~3 m deep. At the waterfall
 * the cliff drops straight into a deep plunge pool instead of a beach.
 */
function applyLake(x: number, z: number, h: number): number {
  const sd = lakeSdf(x, z);
  if (sd > 7) return h;
  const toFoot = Math.hypot(x - FALLS.foot.x, z - FALLS.foot.z);
  const nearFalls = 1 - smoothstep(9, 17, toFoot);
  let profile: number;
  if (sd < 0) {
    const depth = smoothstep(0, lerp(11, 4, nearFalls), -sd);
    profile = 0.25 - 3.3 * depth + noise.noise2(x * 0.15, z * 0.15) * 0.25 * depth;
    // the plunge pool is scoured deeper right under the falls
    profile -= 1.6 * (1 - smoothstep(1, 6.5, toFoot));
  } else {
    profile = 0.25 + sd * 0.18;
  }
  let w = 1 - smoothstep(0, lerp(7, 1.2, nearFalls), sd);
  // Keep the plateau whole up to just past the lip, so the cliff edge is exactly where the
  // stream pours over (the pool's shore blend would otherwise eat into it).
  const along = (x - FALLS.lip.x) * FALLS.dir.x + (z - FALLS.lip.z) * FALLS.dir.z;
  w *= 1 - nearFalls * (1 - smoothstep(0.4, 1.4, along));
  return lerp(h, Math.min(h, profile), w);
}

/** Terrain height before flattening. */
function rawHeight(x: number, z: number): number {
  return applyLake(x, z, applyRiver(x, z, landHeight(x, z)));
}

/** Height of the stream's water surface at the lip, where the waterfall starts. */
export const FALLS_TOP = (() => {
  const pts = riverCourse.points;
  return pts[pts.length - 1]!.bed + RIVER_DEPTH;
})();

/** Water level at the foot of the falls. */
export const FALLS_BOTTOM = WATER_LEVEL;

const flatTargets = FLAT_ZONES.map((f) => rawHeight(f.x, f.z));

/** Final analytic terrain height at world position (x, z). */
export function terrainHeight(x: number, z: number): number {
  let h = rawHeight(x, z);
  for (let i = 0; i < FLAT_ZONES.length; i++) {
    const f = FLAT_ZONES[i]!;
    const d = Math.hypot(x - f.x, z - f.z);
    if (d > f.radius + f.falloff) continue;
    const w = 1 - smoothstep(f.radius, f.radius + f.falloff, d);
    h = lerp(h, flatTargets[i]!, w);
  }
  return h;
}

/** Grid spacing of the sampled terrain. */
export const CELL = TERRAIN_SIZE / (TERRAIN_RES - 1);

/** Samples the analytic height function on the terrain grid (row-major, z rows). */
export function buildHeightGrid(): Float32Array {
  const n = TERRAIN_RES;
  const out = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const z = TERRAIN_ORIGIN + j * CELL;
    for (let i = 0; i < n; i++) {
      const x = TERRAIN_ORIGIN + i * CELL;
      out[j * n + i] = terrainHeight(x, z);
    }
  }
  return out;
}

/**
 * Height lookup on the sampled grid using exactly the same triangle split as the
 * rendered mesh, so the panda's feet always touch the visible ground.
 * Cell triangles: (00, 01, 10) and (01, 11, 10).
 */
export function sampleGrid(grid: Float32Array, x: number, z: number): number {
  const n = TERRAIN_RES;
  const fx = (x - TERRAIN_ORIGIN) / CELL;
  const fz = (z - TERRAIN_ORIGIN) / CELL;
  const i = Math.min(Math.max(Math.floor(fx), 0), n - 2);
  const j = Math.min(Math.max(Math.floor(fz), 0), n - 2);
  const u = clamp01(fx - i);
  const v = clamp01(fz - j);
  const h00 = grid[j * n + i]!;
  const h10 = grid[j * n + i + 1]!;
  const h01 = grid[(j + 1) * n + i]!;
  const h11 = grid[(j + 1) * n + i + 1]!;
  if (u + v <= 1) {
    return h00 + (h10 - h00) * u + (h01 - h00) * v;
  }
  return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}

/** Surface normal of the sampled grid via central differences (unnormalised y = 1). */
export function gridNormal(
  grid: Float32Array,
  x: number,
  z: number,
  out: { x: number; y: number; z: number },
) {
  const e = CELL;
  const hl = sampleGrid(grid, x - e, z);
  const hr = sampleGrid(grid, x + e, z);
  const hd = sampleGrid(grid, x, z - e);
  const hu = sampleGrid(grid, x, z + e);
  const nx = (hl - hr) / (2 * e);
  const nz = (hd - hu) / (2 * e);
  const len = Math.hypot(nx, 1, nz);
  out.x = nx / len;
  out.y = 1 / len;
  out.z = nz / len;
  return out;
}
