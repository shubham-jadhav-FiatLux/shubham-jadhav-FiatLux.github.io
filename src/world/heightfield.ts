/**
 * Pure terrain height generation. No three.js, no DOM: this module is unit tested and
 * shared by the terrain mesh, the physics and every placement routine.
 */
import { clamp01, smin, smoothstep, lerp } from '../utils/math';
import { SimplexNoise } from '../utils/noise';
import {
  sj_CLIFF,
  sj_FALLS,
  sj_FLAT_ZONES,
  sj_LAKE_ELLIPSES,
  sj_PAGODA_HILL,
  sj_RIM,
  sj_RIVER,
  sj_TERRAIN_ORIGIN,
  sj_TERRAIN_RES,
  sj_TERRAIN_SIZE,
  sj_WATER_LEVEL,
  type Ellipse,
  type Vec2,
} from './layout';

const sj_noise = new SimplexNoise(20260929);

function ellipseSdf(sj_x: number, sj_z: number, sj_e: Ellipse): number {
  const sj_dx = sj_x - sj_e.x;
  const sj_dz = sj_z - sj_e.z;
  const sj_c = Math.cos(sj_e.rot);
  const sj_s = Math.sin(sj_e.rot);
  const sj_lx = sj_dx * sj_c + sj_dz * sj_s;
  const sj_lz = -sj_dx * sj_s + sj_dz * sj_c;
  const sj_q = Math.hypot(sj_lx / sj_e.rx, sj_lz / sj_e.rz);
  return (sj_q - 1) * Math.min(sj_e.rx, sj_e.rz);
}

/**
 * Approximate signed distance (metres) to the lake shoreline.
 * Negative inside the water, positive on land.
 */
export function lakeSdf(sj_x: number, sj_z: number): number {
  let sj_d = ellipseSdf(sj_x, sj_z, sj_LAKE_ELLIPSES[0]!);
  for (let sj_i = 1; sj_i < sj_LAKE_ELLIPSES.length; sj_i++) {
    sj_d = smin(sj_d, ellipseSdf(sj_x, sj_z, sj_LAKE_ELLIPSES[sj_i]!), 6);
  }
  // Organic, wobbly shoreline (held steady at the foot of the falls).
  const sj_calm = 1 - smoothstep(6, 12, Math.hypot(sj_x - sj_FALLS.foot.x, sj_z - sj_FALLS.foot.z));
  return sj_d + sj_noise.noise2(sj_x * 0.08, sj_z * 0.08) * 1.6 * (1 - 0.85 * sj_calm);
}

/** Rolling valley floor with the rim, the pagoda hill and the waterfall cliff. */
function landHeight(sj_x: number, sj_z: number): number {
  // Gentle meadows.
  let sj_h =
    1.7 +
    sj_noise.fbm2(sj_x * 0.022, sj_z * 0.022, 4) * 1.1 +
    sj_noise.fbm2(sj_x * 0.09, sj_z * 0.09, 2) * 0.22;
  sj_h = Math.max(sj_h, 0.6);

  // Valley rim: hills rise beyond the playable ellipse.
  const sj_rr = Math.hypot((sj_x - sj_RIM.x) / sj_RIM.rx, (sj_z - sj_RIM.z) / sj_RIM.rz);
  const sj_rim = smoothstep(0.8, 1.32, sj_rr);
  if (sj_rim > 0) {
    const sj_ridge = sj_noise.ridged2(sj_x * 0.009 + 7.3, sj_z * 0.009 - 2.1, 2);
    sj_h += sj_rim * (18 + sj_ridge * 14 + sj_noise.fbm2(sj_x * 0.02, sj_z * 0.02, 2) * 7);
  }

  // Pagoda hill: a smooth dome with a flat top.
  const sj_ph =
    Math.hypot(sj_x - sj_PAGODA_HILL.x, sj_z - sj_PAGODA_HILL.z) / sj_PAGODA_HILL.radius;
  if (sj_ph < 1) {
    sj_h += sj_PAGODA_HILL.height * (1 - smoothstep(sj_PAGODA_HILL.plateau, 1, sj_ph));
  }

  // North-east plateau whose edge becomes the waterfall cliff. Around the falls the cliff
  // steps back into a steep alcove.
  const sj_cd = Math.hypot(sj_x - sj_CLIFF.x, sj_z - sj_CLIFF.z);
  if (sj_cd < sj_CLIFF.radius + 1) {
    const sj_alcove = fallsAlcove(sj_x, sj_z);
    const sj_radius = sj_CLIFF.radius - sj_FALLS.recess * sj_alcove;
    const sj_edge = lerp(sj_CLIFF.edge, sj_FALLS.edge, sj_alcove);
    const sj_t = smoothstep(sj_radius, sj_radius - sj_edge, sj_cd);
    const sj_rough = sj_noise.fbm2(sj_x * 0.12, sj_z * 0.12, 2) * 1.2 * (1 - sj_alcove * 0.6);
    sj_h += sj_t * (sj_CLIFF.height + sj_rough);
  }

  return sj_h;
}

/** 1 on the fall line, fading to 0 at the sides of the alcove. */
function fallsAlcove(sj_x: number, sj_z: number): number {
  const sj_across = Math.abs(
    (sj_x - sj_CLIFF.x) * sj_FALLS.across.x + (sj_z - sj_CLIFF.z) * sj_FALLS.across.z,
  );
  const sj_wobble = sj_noise.noise2(sj_x * 0.35, sj_z * 0.35) * 0.8;
  return (
    1 - smoothstep(sj_FALLS.alcoveHalfWidth * 0.4, sj_FALLS.alcoveHalfWidth, sj_across + sj_wobble)
  );
}

/* ------------------------------------------------------------------ River */

/** Chaikin corner cutting; keeps the end points. */
function smoothLine(sj_pts: readonly Vec2[], sj_iterations: number): Vec2[] {
  let sj_out = sj_pts.slice();
  for (let sj_k = 0; sj_k < sj_iterations; sj_k++) {
    const sj_next: Vec2[] = [sj_out[0]!];
    for (let sj_i = 0; sj_i < sj_out.length - 1; sj_i++) {
      const sj_a = sj_out[sj_i]!;
      const sj_b = sj_out[sj_i + 1]!;
      sj_next.push([sj_a[0] * 0.75 + sj_b[0] * 0.25, sj_a[1] * 0.75 + sj_b[1] * 0.25]);
      sj_next.push([sj_a[0] * 0.25 + sj_b[0] * 0.75, sj_a[1] * 0.25 + sj_b[1] * 0.75]);
    }
    sj_next.push(sj_out[sj_out.length - 1]!);
    sj_out = sj_next;
  }
  return sj_out;
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
export const sj_RIVER_DEPTH = 0.42;
const sj_RIVER_BANK = 2.4;
const sj_SPRING_RADIUS = 3.2;

/**
 * The stream, densely sampled: its bed only ever runs downhill (a running minimum of the
 * ground along the course), so the water surface never climbs.
 */
export const sj_riverCourse: { points: RiverPoint[]; length: number } = (() => {
  const sj_line = smoothLine(sj_RIVER, 3);
  // resample evenly every ~0.6 m
  const sj_dense: Vec2[] = [];
  for (let sj_i = 0; sj_i < sj_line.length - 1; sj_i++) {
    const sj_a = sj_line[sj_i]!;
    const sj_b = sj_line[sj_i + 1]!;
    const sj_n = Math.max(1, Math.ceil(Math.hypot(sj_b[0] - sj_a[0], sj_b[1] - sj_a[1]) / 0.6));
    for (let sj_k = 0; sj_k < sj_n; sj_k++) {
      const sj_t = sj_k / sj_n;
      sj_dense.push([lerp(sj_a[0], sj_b[0], sj_t), lerp(sj_a[1], sj_b[1], sj_t)]);
    }
  }
  sj_dense.push(sj_line[sj_line.length - 1]!);
  const sj_points: RiverPoint[] = [];
  let sj_s = 0;
  let sj_bed = Infinity;
  sj_dense.forEach(([sj_x, sj_z], sj_i) => {
    if (sj_i > 0) sj_s += Math.hypot(sj_x - sj_dense[sj_i - 1]![0], sj_z - sj_dense[sj_i - 1]![1]);
    sj_points.push({ x: sj_x, z: sj_z, s: sj_s, bed: 0, halfWidth: 0 });
  });
  const sj_length = sj_s;
  for (const sj_p of sj_points) {
    const sj_f = sj_p.s / sj_length;
    sj_p.halfWidth = lerp(0.95, 1.75, smoothstep(0, 0.7, sj_f));
    const sj_depth = lerp(0.9, 1.25, sj_f);
    sj_bed = Math.min(sj_bed, landHeight(sj_p.x, sj_p.z) - sj_depth);
    sj_p.bed = sj_bed;
  }
  return { points: sj_points, length: sj_length };
})();

const sj_riverBox = (() => {
  const sj_m = sj_RIVER_BANK + 3 + sj_SPRING_RADIUS;
  let sj_x0 = Infinity;
  let sj_z0 = Infinity;
  let sj_x1 = -Infinity;
  let sj_z1 = -Infinity;
  for (const sj_p of sj_riverCourse.points) {
    sj_x0 = Math.min(sj_x0, sj_p.x - sj_m);
    sj_z0 = Math.min(sj_z0, sj_p.z - sj_m);
    sj_x1 = Math.max(sj_x1, sj_p.x + sj_m);
    sj_z1 = Math.max(sj_z1, sj_p.z + sj_m);
  }
  return { x0: sj_x0, z0: sj_z0, x1: sj_x1, z1: sj_z1 };
})();

/** Closest point of the stream's centre line: distance, bed height and half-width there. */
export function riverAt(
  sj_x: number,
  sj_z: number,
): { dist: number; bed: number; halfWidth: number; s: number } | null {
  if (
    sj_x < sj_riverBox.x0 ||
    sj_x > sj_riverBox.x1 ||
    sj_z < sj_riverBox.z0 ||
    sj_z > sj_riverBox.z1
  )
    return null;
  const sj_pts = sj_riverCourse.points;
  let sj_best = Infinity;
  let sj_bi = 0;
  let sj_bt = 0;
  for (let sj_i = 0; sj_i < sj_pts.length - 1; sj_i++) {
    const sj_a = sj_pts[sj_i]!;
    const sj_b = sj_pts[sj_i + 1]!;
    const sj_abx = sj_b.x - sj_a.x;
    const sj_abz = sj_b.z - sj_a.z;
    const sj_len2 = sj_abx * sj_abx + sj_abz * sj_abz;
    const sj_t =
      sj_len2 > 0 ? clamp01(((sj_x - sj_a.x) * sj_abx + (sj_z - sj_a.z) * sj_abz) / sj_len2) : 0;
    const sj_dx = sj_x - (sj_a.x + sj_abx * sj_t);
    const sj_dz = sj_z - (sj_a.z + sj_abz * sj_t);
    const sj_d2 = sj_dx * sj_dx + sj_dz * sj_dz;
    if (sj_d2 < sj_best) {
      sj_best = sj_d2;
      sj_bi = sj_i;
      sj_bt = sj_t;
    }
  }
  const sj_a = sj_pts[sj_bi]!;
  const sj_b = sj_pts[sj_bi + 1]!;
  return {
    dist: Math.sqrt(sj_best),
    bed: lerp(sj_a.bed, sj_b.bed, sj_bt),
    halfWidth: lerp(sj_a.halfWidth, sj_b.halfWidth, sj_bt),
    s: lerp(sj_a.s, sj_b.s, sj_bt),
  };
}

/** Cuts the stream bed (with gently sloping banks) and the spring pool into the ground. */
function applyRiver(sj_x: number, sj_z: number, sj_h: number): number {
  const sj_r = riverAt(sj_x, sj_z);
  if (!sj_r) return sj_h;
  let sj_target = lerp(
    sj_r.bed,
    sj_h,
    smoothstep(sj_r.halfWidth, sj_r.halfWidth + sj_RIVER_BANK, sj_r.dist),
  );
  const sj_spring = sj_riverCourse.points[0]!;
  const sj_ds = Math.hypot(sj_x - sj_spring.x, sj_z - sj_spring.z);
  if (sj_ds < sj_SPRING_RADIUS + sj_RIVER_BANK) {
    const sj_bowl = lerp(
      sj_spring.bed - 0.35,
      sj_h,
      smoothstep(sj_SPRING_RADIUS - 1, sj_SPRING_RADIUS + 1.6, sj_ds),
    );
    sj_target = Math.min(sj_target, sj_bowl);
  }
  return Math.min(sj_h, sj_target);
}

/**
 * Carves the lake basin: a shallow sandy shelf dropping to ~3 m deep. At the waterfall
 * the cliff drops straight into a deep plunge pool instead of a beach.
 */
function applyLake(sj_x: number, sj_z: number, sj_h: number): number {
  const sj_sd = lakeSdf(sj_x, sj_z);
  if (sj_sd > 7) return sj_h;
  const sj_toFoot = Math.hypot(sj_x - sj_FALLS.foot.x, sj_z - sj_FALLS.foot.z);
  const sj_nearFalls = 1 - smoothstep(9, 17, sj_toFoot);
  let sj_profile: number;
  if (sj_sd < 0) {
    const sj_depth = smoothstep(0, lerp(11, 4, sj_nearFalls), -sj_sd);
    sj_profile =
      0.25 - 3.3 * sj_depth + sj_noise.noise2(sj_x * 0.15, sj_z * 0.15) * 0.25 * sj_depth;
    // the plunge pool is scoured deeper right under the falls
    sj_profile -= 1.6 * (1 - smoothstep(1, 6.5, sj_toFoot));
  } else {
    sj_profile = 0.25 + sj_sd * 0.18;
  }
  let sj_w = 1 - smoothstep(0, lerp(7, 1.2, sj_nearFalls), sj_sd);
  // Keep the plateau whole up to just past the lip, so the cliff edge is exactly where the
  // stream pours over (the pool's shore blend would otherwise eat into it).
  const sj_along =
    (sj_x - sj_FALLS.lip.x) * sj_FALLS.dir.x + (sj_z - sj_FALLS.lip.z) * sj_FALLS.dir.z;
  sj_w *= 1 - sj_nearFalls * (1 - smoothstep(0.4, 1.4, sj_along));
  return lerp(sj_h, Math.min(sj_h, sj_profile), sj_w);
}

/** Terrain height before flattening. */
function rawHeight(sj_x: number, sj_z: number): number {
  return applyLake(sj_x, sj_z, applyRiver(sj_x, sj_z, landHeight(sj_x, sj_z)));
}

/** Height of the stream's water surface at the lip, where the waterfall starts. */
export const sj_FALLS_TOP = (() => {
  const sj_pts = sj_riverCourse.points;
  return sj_pts[sj_pts.length - 1]!.bed + sj_RIVER_DEPTH;
})();

/** Water level at the foot of the falls. */
export const sj_FALLS_BOTTOM = sj_WATER_LEVEL;

const sj_flatTargets = sj_FLAT_ZONES.map((sj_f) => rawHeight(sj_f.x, sj_f.z));

/** Final analytic terrain height at world position (x, z). */
export function terrainHeight(sj_x: number, sj_z: number): number {
  let sj_h = rawHeight(sj_x, sj_z);
  for (let sj_i = 0; sj_i < sj_FLAT_ZONES.length; sj_i++) {
    const sj_f = sj_FLAT_ZONES[sj_i]!;
    const sj_d = Math.hypot(sj_x - sj_f.x, sj_z - sj_f.z);
    if (sj_d > sj_f.radius + sj_f.falloff) continue;
    const sj_w = 1 - smoothstep(sj_f.radius, sj_f.radius + sj_f.falloff, sj_d);
    sj_h = lerp(sj_h, sj_flatTargets[sj_i]!, sj_w);
  }
  return sj_h;
}

/** Grid spacing of the sampled terrain. */
export const sj_CELL = sj_TERRAIN_SIZE / (sj_TERRAIN_RES - 1);

/** Samples the analytic height function on the terrain grid (row-major, z rows). */
export function buildHeightGrid(): Float32Array {
  const sj_n = sj_TERRAIN_RES;
  const sj_out = new Float32Array(sj_n * sj_n);
  for (let sj_j = 0; sj_j < sj_n; sj_j++) {
    const sj_z = sj_TERRAIN_ORIGIN + sj_j * sj_CELL;
    for (let sj_i = 0; sj_i < sj_n; sj_i++) {
      const sj_x = sj_TERRAIN_ORIGIN + sj_i * sj_CELL;
      sj_out[sj_j * sj_n + sj_i] = terrainHeight(sj_x, sj_z);
    }
  }
  return sj_out;
}

/**
 * Height lookup on the sampled grid using exactly the same triangle split as the
 * rendered mesh, so the panda's feet always touch the visible ground.
 * Cell triangles: (00, 01, 10) and (01, 11, 10).
 */
export function sampleGrid(sj_grid: Float32Array, sj_x: number, sj_z: number): number {
  const sj_n = sj_TERRAIN_RES;
  const sj_fx = (sj_x - sj_TERRAIN_ORIGIN) / sj_CELL;
  const sj_fz = (sj_z - sj_TERRAIN_ORIGIN) / sj_CELL;
  const sj_i = Math.min(Math.max(Math.floor(sj_fx), 0), sj_n - 2);
  const sj_j = Math.min(Math.max(Math.floor(sj_fz), 0), sj_n - 2);
  const sj_u = clamp01(sj_fx - sj_i);
  const sj_v = clamp01(sj_fz - sj_j);
  const sj_h00 = sj_grid[sj_j * sj_n + sj_i]!;
  const sj_h10 = sj_grid[sj_j * sj_n + sj_i + 1]!;
  const sj_h01 = sj_grid[(sj_j + 1) * sj_n + sj_i]!;
  const sj_h11 = sj_grid[(sj_j + 1) * sj_n + sj_i + 1]!;
  if (sj_u + sj_v <= 1) {
    return sj_h00 + (sj_h10 - sj_h00) * sj_u + (sj_h01 - sj_h00) * sj_v;
  }
  return sj_h11 + (sj_h01 - sj_h11) * (1 - sj_u) + (sj_h10 - sj_h11) * (1 - sj_v);
}

/** Surface normal of the sampled grid via central differences (unnormalised y = 1). */
export function gridNormal(
  sj_grid: Float32Array,
  sj_x: number,
  sj_z: number,
  sj_out: { x: number; y: number; z: number },
) {
  const sj_e = sj_CELL;
  const sj_hl = sampleGrid(sj_grid, sj_x - sj_e, sj_z);
  const sj_hr = sampleGrid(sj_grid, sj_x + sj_e, sj_z);
  const sj_hd = sampleGrid(sj_grid, sj_x, sj_z - sj_e);
  const sj_hu = sampleGrid(sj_grid, sj_x, sj_z + sj_e);
  const sj_nx = (sj_hl - sj_hr) / (2 * sj_e);
  const sj_nz = (sj_hd - sj_hu) / (2 * sj_e);
  const sj_len = Math.hypot(sj_nx, 1, sj_nz);
  sj_out.x = sj_nx / sj_len;
  sj_out.y = 1 / sj_len;
  sj_out.z = sj_nz / sj_len;
  return sj_out;
}
