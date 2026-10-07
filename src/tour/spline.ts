import { Vector3 } from 'three';

/**
 * Smooth camera paths made of cubic Bezier segments.
 *
 * A path either passes through a list of points (handles are worked out so the curve is
 * smooth and does not overshoot: centripetal Catmull-Rom, converted to Bezier form) or
 * takes the control points directly (P0, C, C, P1, C, C, P2 ...), like an SVG path.
 * Positions are looked up by distance along the curve, so a camera moving along it
 * keeps an even speed however the points are spaced; timing is a separate concern.
 */
export class BezierPath {
  /** control points: P0, C0a, C0b, P1, C1a, C1b, P2 ... (3n + 1 of them) */
  readonly controls: Vector3[];
  /** arc length of the whole path (m) */
  readonly length: number;
  /** arc length at each of the points the path passes through */
  readonly knots: number[];
  private readonly segments: number;
  /** cumulative arc length at each sample (SAMPLES per segment) */
  private readonly table: Float64Array;

  private constructor(sj_controls: Vector3[]) {
    if (sj_controls.length < 4 || (sj_controls.length - 1) % 3 !== 0)
      throw new Error('a Bezier path needs 3n + 1 control points');
    this.controls = sj_controls;
    this.segments = (sj_controls.length - 1) / 3;
    this.table = new Float64Array(this.segments * sj_SAMPLES + 1);
    const sj_p = new Vector3();
    const sj_prev = new Vector3().copy(sj_controls[0]!);
    let sj_total = 0;
    this.knots = [0];
    for (let sj_s = 0; sj_s < this.segments; sj_s++) {
      for (let sj_k = 1; sj_k <= sj_SAMPLES; sj_k++) {
        this.evaluate(sj_s, sj_k / sj_SAMPLES, sj_p);
        sj_total += sj_p.distanceTo(sj_prev);
        sj_prev.copy(sj_p);
        this.table[sj_s * sj_SAMPLES + sj_k] = sj_total;
      }
      this.knots.push(sj_total);
    }
    this.length = sj_total;
  }

  /** A smooth path through `points` (at least two). */
  static through(sj_points: Vector3[]): BezierPath {
    if (sj_points.length < 2) throw new Error('a path needs at least two points');
    const sj_n = sj_points.length;
    // phantom end points continue the first and last segments
    const sj_P = (sj_i: number): Vector3 =>
      sj_i < 0
        ? sj_points[0]!.clone().multiplyScalar(2).sub(sj_points[1]!)
        : sj_i >= sj_n
          ? sj_points[sj_n - 1]!.clone()
              .multiplyScalar(2)
              .sub(sj_points[sj_n - 2]!)
          : sj_points[sj_i]!;
    const sj_controls: Vector3[] = [sj_points[0]!.clone()];
    for (let sj_i = 0; sj_i < sj_n - 1; sj_i++) {
      const sj_p0 = sj_P(sj_i - 1);
      const sj_p1 = sj_P(sj_i);
      const sj_p2 = sj_P(sj_i + 1);
      const sj_p3 = sj_P(sj_i + 2);
      // centripetal knot spacing (alpha = 0.5): no cusps, no loops, no overshoot
      const sj_d1 = Math.max(1e-4, Math.sqrt(sj_p1.distanceTo(sj_p0)));
      const sj_d2 = Math.max(1e-4, Math.sqrt(sj_p2.distanceTo(sj_p1)));
      const sj_d3 = Math.max(1e-4, Math.sqrt(sj_p3.distanceTo(sj_p2)));
      const sj_b1 = new Vector3()
        .addScaledVector(sj_p2, sj_d1 * sj_d1)
        .addScaledVector(sj_p0, -sj_d2 * sj_d2)
        .addScaledVector(sj_p1, 2 * sj_d1 * sj_d1 + 3 * sj_d1 * sj_d2 + sj_d2 * sj_d2)
        .multiplyScalar(1 / (3 * sj_d1 * (sj_d1 + sj_d2)));
      const sj_b2 = new Vector3()
        .addScaledVector(sj_p1, sj_d3 * sj_d3)
        .addScaledVector(sj_p3, -sj_d2 * sj_d2)
        .addScaledVector(sj_p2, 2 * sj_d3 * sj_d3 + 3 * sj_d3 * sj_d2 + sj_d2 * sj_d2)
        .multiplyScalar(1 / (3 * sj_d3 * (sj_d3 + sj_d2)));
      sj_controls.push(sj_b1, sj_b2, sj_p2.clone());
    }
    return new BezierPath(sj_controls);
  }

  /** A path from explicit control points: P0, C, C, P1, C, C, P2 ... */
  static bezier(sj_controls: Vector3[]): BezierPath {
    return new BezierPath(sj_controls.map((sj_c) => sj_c.clone()));
  }

  /** The point `sj_s` metres along the path (clamped to its ends). */
  at(sj_s: number, sj_out = new Vector3()): Vector3 {
    const sj_t = this.table;
    if (sj_s <= 0) return sj_out.copy(this.controls[0]!);
    if (sj_s >= this.length) return sj_out.copy(this.controls[this.controls.length - 1]!);
    // binary search for the sample interval holding s
    let sj_lo = 0;
    let sj_hi = sj_t.length - 1;
    while (sj_hi - sj_lo > 1) {
      const sj_mid = (sj_lo + sj_hi) >> 1;
      if (sj_t[sj_mid]! < sj_s) sj_lo = sj_mid;
      else sj_hi = sj_mid;
    }
    const sj_f = (sj_s - sj_t[sj_lo]!) / Math.max(1e-9, sj_t[sj_hi]! - sj_t[sj_lo]!);
    const sj_seg = Math.min(this.segments - 1, Math.floor(sj_lo / sj_SAMPLES));
    const sj_u = (sj_lo - sj_seg * sj_SAMPLES + sj_f) / sj_SAMPLES;
    return this.evaluate(sj_seg, sj_u, sj_out);
  }

  /** The point at fraction `sj_u` (0..1) of the length. */
  atFraction(sj_u: number, sj_out = new Vector3()): Vector3 {
    return this.at(sj_u * this.length, sj_out);
  }

  /** Unit direction of travel `sj_s` metres along the path. */
  tangent(sj_s: number, sj_out = new Vector3()): Vector3 {
    const sj_h = Math.min(0.25, this.length / 4);
    const sj_a = this.at(Math.max(0, sj_s - sj_h), new Vector3());
    this.at(Math.min(this.length, sj_s + sj_h), sj_out);
    return sj_out.sub(sj_a).normalize();
  }

  private evaluate(sj_segment: number, sj_u: number, sj_out: Vector3): Vector3 {
    const sj_c = this.controls;
    const sj_i = sj_segment * 3;
    const sj_a = sj_c[sj_i]!;
    const sj_b = sj_c[sj_i + 1]!;
    const sj_d = sj_c[sj_i + 2]!;
    const sj_e = sj_c[sj_i + 3]!;
    const sj_v = 1 - sj_u;
    const sj_w0 = sj_v * sj_v * sj_v;
    const sj_w1 = 3 * sj_v * sj_v * sj_u;
    const sj_w2 = 3 * sj_v * sj_u * sj_u;
    const sj_w3 = sj_u * sj_u * sj_u;
    return sj_out.set(
      sj_a.x * sj_w0 + sj_b.x * sj_w1 + sj_d.x * sj_w2 + sj_e.x * sj_w3,
      sj_a.y * sj_w0 + sj_b.y * sj_w1 + sj_d.y * sj_w2 + sj_e.y * sj_w3,
      sj_a.z * sj_w0 + sj_b.z * sj_w1 + sj_d.z * sj_w2 + sj_e.z * sj_w3,
    );
  }
}

const sj_SAMPLES = 48;

/**
 * Timing along a path: a smooth, monotone curve through (time, fraction) marks with the
 * camera at rest at both ends (ease in, ease out) and no sudden changes of speed between
 * marks. With only a start and an end mark it is the classic smoothstep.
 */
export class PathTiming {
  private readonly t: number[];
  private readonly f: number[];
  private readonly m: number[];

  constructor(sj_marks: { t: number; f: number }[]) {
    const sj_sorted = [...sj_marks].sort((sj_a, sj_b) => sj_a.t - sj_b.t);
    this.t = sj_sorted.map((sj_k) => sj_k.t);
    this.f = sj_sorted.map((sj_k) => Math.min(1, Math.max(0, sj_k.f)));
    const sj_n = this.t.length;
    // Fritsch-Carlson monotone cubic slopes, zero at the ends
    const sj_delta: number[] = [];
    for (let sj_i = 0; sj_i < sj_n - 1; sj_i++)
      sj_delta.push(
        (this.f[sj_i + 1]! - this.f[sj_i]!) / Math.max(1e-6, this.t[sj_i + 1]! - this.t[sj_i]!),
      );
    const sj_m = new Array<number>(sj_n).fill(0);
    for (let sj_i = 1; sj_i < sj_n - 1; sj_i++) {
      const sj_a = sj_delta[sj_i - 1]!;
      const sj_b = sj_delta[sj_i]!;
      if (sj_a * sj_b <= 0) sj_m[sj_i] = 0;
      else {
        // weighted harmonic mean keeps the curve monotone
        const sj_ha = this.t[sj_i]! - this.t[sj_i - 1]!;
        const sj_hb = this.t[sj_i + 1]! - this.t[sj_i]!;
        const sj_w1 = 2 * sj_hb + sj_ha;
        const sj_w2 = sj_hb + 2 * sj_ha;
        sj_m[sj_i] = (sj_w1 + sj_w2) / (sj_w1 / sj_a + sj_w2 / sj_b);
      }
    }
    this.m = sj_m;
  }

  get duration(): number {
    return this.t[this.t.length - 1]! - this.t[0]!;
  }

  /** Fraction of the path covered at time `sj_time`. */
  fraction(sj_time: number): number {
    const sj_t = this.t;
    const sj_n = sj_t.length;
    if (sj_n === 1 || sj_time <= sj_t[0]!) return this.f[0]!;
    if (sj_time >= sj_t[sj_n - 1]!) return this.f[sj_n - 1]!;
    let sj_i = 0;
    while (sj_i < sj_n - 2 && sj_time > sj_t[sj_i + 1]!) sj_i++;
    const sj_h = sj_t[sj_i + 1]! - sj_t[sj_i]!;
    const sj_s = (sj_time - sj_t[sj_i]!) / sj_h;
    const sj_s2 = sj_s * sj_s;
    const sj_s3 = sj_s2 * sj_s;
    return (
      (2 * sj_s3 - 3 * sj_s2 + 1) * this.f[sj_i]! +
      (sj_s3 - 2 * sj_s2 + sj_s) * sj_h * this.m[sj_i]! +
      (-2 * sj_s3 + 3 * sj_s2) * this.f[sj_i + 1]! +
      (sj_s3 - sj_s2) * sj_h * this.m[sj_i + 1]!
    );
  }
}

/**
 * CSS-style cubic-bezier easing (x1, y1, x2, y2), e.g. [0.42, 0, 0.58, 1] for ease-in-out.
 * Returns a function from linear progress (0..1) to eased progress.
 */
export function cubicBezierEase(sj_x1: number, sj_y1: number, sj_x2: number, sj_y2: number) {
  const sj_cx = 3 * sj_x1;
  const sj_bx = 3 * (sj_x2 - sj_x1) - sj_cx;
  const sj_ax = 1 - sj_cx - sj_bx;
  const sj_cy = 3 * sj_y1;
  const sj_by = 3 * (sj_y2 - sj_y1) - sj_cy;
  const sj_ay = 1 - sj_cy - sj_by;
  const sj_sx = (sj_u: number) => ((sj_ax * sj_u + sj_bx) * sj_u + sj_cx) * sj_u;
  const sj_sy = (sj_u: number) => ((sj_ay * sj_u + sj_by) * sj_u + sj_cy) * sj_u;
  const sj_dx = (sj_u: number) => (3 * sj_ax * sj_u + 2 * sj_bx) * sj_u + sj_cx;
  return (sj_x: number): number => {
    if (sj_x <= 0) return 0;
    if (sj_x >= 1) return 1;
    // Newton's method, falling back to bisection
    let sj_u = sj_x;
    for (let sj_i = 0; sj_i < 8; sj_i++) {
      const sj_err = sj_sx(sj_u) - sj_x;
      if (Math.abs(sj_err) < 1e-6) return sj_sy(sj_u);
      const sj_d = sj_dx(sj_u);
      if (Math.abs(sj_d) < 1e-6) break;
      sj_u -= sj_err / sj_d;
    }
    let sj_lo = 0;
    let sj_hi = 1;
    sj_u = sj_x;
    for (let sj_i = 0; sj_i < 40; sj_i++) {
      const sj_v = sj_sx(sj_u);
      if (Math.abs(sj_v - sj_x) < 1e-6) break;
      if (sj_v < sj_x) sj_lo = sj_u;
      else sj_hi = sj_u;
      sj_u = (sj_lo + sj_hi) / 2;
    }
    return sj_sy(sj_u);
  };
}
