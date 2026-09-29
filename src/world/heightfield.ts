/**
 * Pure terrain height generation. No three.js, no DOM: this module is unit tested and
 * shared by the terrain mesh, the physics and every placement routine.
 */
import { clamp01, smin, smoothstep, lerp } from '../utils/math';
import { SimplexNoise } from '../utils/noise';
import {
  CLIFF,
  FLAT_ZONES,
  LAKE_ELLIPSES,
  PAGODA_HILL,
  RIM,
  TERRAIN_ORIGIN,
  TERRAIN_RES,
  TERRAIN_SIZE,
  type Ellipse,
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
  // Organic, wobbly shoreline.
  return d + noise.noise2(x * 0.08, z * 0.08) * 1.6;
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

  // North-east plateau whose edge becomes the waterfall cliff.
  const cd = Math.hypot(x - CLIFF.x, z - CLIFF.z);
  if (cd < CLIFF.radius + 1) {
    // inside the escarpment
    const t = smoothstep(CLIFF.radius, CLIFF.radius - CLIFF.edge, cd);
    const rough = noise.fbm2(x * 0.12, z * 0.12, 2) * 1.2;
    h += t * (CLIFF.height + rough);
  }

  return h;
}

/** Carves the lake basin: a shallow sandy shelf dropping to ~3 m deep. */
function applyLake(x: number, z: number, h: number): number {
  const sd = lakeSdf(x, z);
  if (sd > 7) return h;
  let profile: number;
  if (sd < 0) {
    const depth = smoothstep(0, 11, -sd);
    profile = 0.25 - 3.3 * depth + noise.noise2(x * 0.15, z * 0.15) * 0.25 * depth;
  } else {
    profile = 0.25 + sd * 0.18;
  }
  const w = 1 - smoothstep(0, 7, sd);
  return lerp(h, Math.min(h, profile), w);
}

/** Terrain height before flattening. */
function rawHeight(x: number, z: number): number {
  return applyLake(x, z, landHeight(x, z));
}

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
