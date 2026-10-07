/** Small, allocation-free math helpers shared by gameplay and generation code. */

export const sj_TAU = Math.PI * 2;

export function clamp(sj_v: number, sj_min: number, sj_max: number): number {
  return sj_v < sj_min ? sj_min : sj_v > sj_max ? sj_max : sj_v;
}

export function clamp01(sj_v: number): number {
  return sj_v < 0 ? 0 : sj_v > 1 ? 1 : sj_v;
}

export function lerp(sj_a: number, sj_b: number, sj_t: number): number {
  return sj_a + (sj_b - sj_a) * sj_t;
}

export function inverseLerp(sj_a: number, sj_b: number, sj_v: number): number {
  return sj_a === sj_b ? 0 : (sj_v - sj_a) / (sj_b - sj_a);
}

export function remap(
  sj_v: number,
  sj_inMin: number,
  sj_inMax: number,
  sj_outMin: number,
  sj_outMax: number,
) {
  return lerp(sj_outMin, sj_outMax, inverseLerp(sj_inMin, sj_inMax, sj_v));
}

export function smoothstep(sj_edge0: number, sj_edge1: number, sj_x: number): number {
  const sj_t = clamp01((sj_x - sj_edge0) / (sj_edge1 - sj_edge0));
  return sj_t * sj_t * (3 - 2 * sj_t);
}

/**
 * Frame-rate independent exponential smoothing.
 * `sj_lambda` is the "speed": higher values converge faster (~1/lambda seconds to 63%).
 */
export function damp(
  sj_current: number,
  sj_target: number,
  sj_lambda: number,
  sj_dt: number,
): number {
  return lerp(sj_current, sj_target, 1 - Math.exp(-sj_lambda * sj_dt));
}

/** Wraps an angle to the range [-PI, PI). */
export function wrapAngle(sj_a: number): number {
  sj_a = (sj_a + Math.PI) % sj_TAU;
  if (sj_a < 0) sj_a += sj_TAU;
  return sj_a - Math.PI;
}

/** Shortest signed difference between two angles. */
export function angleDelta(sj_from: number, sj_to: number): number {
  return wrapAngle(sj_to - sj_from);
}

export function dampAngle(
  sj_current: number,
  sj_target: number,
  sj_lambda: number,
  sj_dt: number,
): number {
  return sj_current + angleDelta(sj_current, sj_target) * (1 - Math.exp(-sj_lambda * sj_dt));
}

export function easeInOutCubic(sj_t: number): number {
  return sj_t < 0.5 ? 4 * sj_t * sj_t * sj_t : 1 - Math.pow(-2 * sj_t + 2, 3) / 2;
}

export function easeOutCubic(sj_t: number): number {
  return 1 - Math.pow(1 - sj_t, 3);
}

export function easeOutBack(sj_t: number, sj_s = 1.70158): number {
  const sj_c3 = sj_s + 1;
  return 1 + sj_c3 * Math.pow(sj_t - 1, 3) + sj_s * Math.pow(sj_t - 1, 2);
}

export function easeInOutSine(sj_t: number): number {
  return -(Math.cos(Math.PI * sj_t) - 1) / 2;
}

/** Polynomial smooth minimum (Inigo Quilez). */
export function smin(sj_a: number, sj_b: number, sj_k: number): number {
  const sj_h = clamp01(0.5 + (0.5 * (sj_b - sj_a)) / sj_k);
  return lerp(sj_b, sj_a, sj_h) - sj_k * sj_h * (1 - sj_h);
}

/** Distance from point p to segment ab in 2D. */
export function distToSegment(
  sj_px: number,
  sj_pz: number,
  sj_ax: number,
  sj_az: number,
  sj_bx: number,
  sj_bz: number,
): number {
  const sj_abx = sj_bx - sj_ax;
  const sj_abz = sj_bz - sj_az;
  const sj_apx = sj_px - sj_ax;
  const sj_apz = sj_pz - sj_az;
  const sj_len2 = sj_abx * sj_abx + sj_abz * sj_abz;
  const sj_t = sj_len2 > 0 ? clamp01((sj_apx * sj_abx + sj_apz * sj_abz) / sj_len2) : 0;
  const sj_dx = sj_apx - sj_abx * sj_t;
  const sj_dz = sj_apz - sj_abz * sj_t;
  return Math.sqrt(sj_dx * sj_dx + sj_dz * sj_dz);
}

/** Distance from a point to an open polyline given as [x, z] pairs. */
export function distToPolyline(
  sj_px: number,
  sj_pz: number,
  sj_pts: ReadonlyArray<readonly [number, number]>,
) {
  let sj_best = Infinity;
  for (let sj_i = 0; sj_i < sj_pts.length - 1; sj_i++) {
    const sj_a = sj_pts[sj_i]!;
    const sj_b = sj_pts[sj_i + 1]!;
    const sj_d = distToSegment(sj_px, sj_pz, sj_a[0], sj_a[1], sj_b[0], sj_b[1]);
    if (sj_d < sj_best) sj_best = sj_d;
  }
  return sj_best;
}
