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

  private constructor(controls: Vector3[]) {
    if (controls.length < 4 || (controls.length - 1) % 3 !== 0)
      throw new Error('a Bezier path needs 3n + 1 control points');
    this.controls = controls;
    this.segments = (controls.length - 1) / 3;
    this.table = new Float64Array(this.segments * SAMPLES + 1);
    const p = new Vector3();
    const prev = new Vector3().copy(controls[0]!);
    let total = 0;
    this.knots = [0];
    for (let s = 0; s < this.segments; s++) {
      for (let k = 1; k <= SAMPLES; k++) {
        this.evaluate(s, k / SAMPLES, p);
        total += p.distanceTo(prev);
        prev.copy(p);
        this.table[s * SAMPLES + k] = total;
      }
      this.knots.push(total);
    }
    this.length = total;
  }

  /** A smooth path through `points` (at least two). */
  static through(points: Vector3[]): BezierPath {
    if (points.length < 2) throw new Error('a path needs at least two points');
    const n = points.length;
    // phantom end points continue the first and last segments
    const P = (i: number): Vector3 =>
      i < 0
        ? points[0]!.clone().multiplyScalar(2).sub(points[1]!)
        : i >= n
          ? points[n - 1]!.clone()
              .multiplyScalar(2)
              .sub(points[n - 2]!)
          : points[i]!;
    const controls: Vector3[] = [points[0]!.clone()];
    for (let i = 0; i < n - 1; i++) {
      const p0 = P(i - 1);
      const p1 = P(i);
      const p2 = P(i + 1);
      const p3 = P(i + 2);
      // centripetal knot spacing (alpha = 0.5): no cusps, no loops, no overshoot
      const d1 = Math.max(1e-4, Math.sqrt(p1.distanceTo(p0)));
      const d2 = Math.max(1e-4, Math.sqrt(p2.distanceTo(p1)));
      const d3 = Math.max(1e-4, Math.sqrt(p3.distanceTo(p2)));
      const b1 = new Vector3()
        .addScaledVector(p2, d1 * d1)
        .addScaledVector(p0, -d2 * d2)
        .addScaledVector(p1, 2 * d1 * d1 + 3 * d1 * d2 + d2 * d2)
        .multiplyScalar(1 / (3 * d1 * (d1 + d2)));
      const b2 = new Vector3()
        .addScaledVector(p1, d3 * d3)
        .addScaledVector(p3, -d2 * d2)
        .addScaledVector(p2, 2 * d3 * d3 + 3 * d3 * d2 + d2 * d2)
        .multiplyScalar(1 / (3 * d3 * (d3 + d2)));
      controls.push(b1, b2, p2.clone());
    }
    return new BezierPath(controls);
  }

  /** A path from explicit control points: P0, C, C, P1, C, C, P2 ... */
  static bezier(controls: Vector3[]): BezierPath {
    return new BezierPath(controls.map((c) => c.clone()));
  }

  /** The point `s` metres along the path (clamped to its ends). */
  at(s: number, out = new Vector3()): Vector3 {
    const t = this.table;
    if (s <= 0) return out.copy(this.controls[0]!);
    if (s >= this.length) return out.copy(this.controls[this.controls.length - 1]!);
    // binary search for the sample interval holding s
    let lo = 0;
    let hi = t.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (t[mid]! < s) lo = mid;
      else hi = mid;
    }
    const f = (s - t[lo]!) / Math.max(1e-9, t[hi]! - t[lo]!);
    const seg = Math.min(this.segments - 1, Math.floor(lo / SAMPLES));
    const u = (lo - seg * SAMPLES + f) / SAMPLES;
    return this.evaluate(seg, u, out);
  }

  /** The point at fraction `u` (0..1) of the length. */
  atFraction(u: number, out = new Vector3()): Vector3 {
    return this.at(u * this.length, out);
  }

  /** Unit direction of travel `s` metres along the path. */
  tangent(s: number, out = new Vector3()): Vector3 {
    const h = Math.min(0.25, this.length / 4);
    const a = this.at(Math.max(0, s - h), new Vector3());
    this.at(Math.min(this.length, s + h), out);
    return out.sub(a).normalize();
  }

  private evaluate(segment: number, u: number, out: Vector3): Vector3 {
    const c = this.controls;
    const i = segment * 3;
    const a = c[i]!;
    const b = c[i + 1]!;
    const d = c[i + 2]!;
    const e = c[i + 3]!;
    const v = 1 - u;
    const w0 = v * v * v;
    const w1 = 3 * v * v * u;
    const w2 = 3 * v * u * u;
    const w3 = u * u * u;
    return out.set(
      a.x * w0 + b.x * w1 + d.x * w2 + e.x * w3,
      a.y * w0 + b.y * w1 + d.y * w2 + e.y * w3,
      a.z * w0 + b.z * w1 + d.z * w2 + e.z * w3,
    );
  }
}

const SAMPLES = 48;

/**
 * Timing along a path: a smooth, monotone curve through (time, fraction) marks with the
 * camera at rest at both ends (ease in, ease out) and no sudden changes of speed between
 * marks. With only a start and an end mark it is the classic smoothstep.
 */
export class PathTiming {
  private readonly t: number[];
  private readonly f: number[];
  private readonly m: number[];

  constructor(marks: { t: number; f: number }[]) {
    const sorted = [...marks].sort((a, b) => a.t - b.t);
    this.t = sorted.map((k) => k.t);
    this.f = sorted.map((k) => Math.min(1, Math.max(0, k.f)));
    const n = this.t.length;
    // Fritsch-Carlson monotone cubic slopes, zero at the ends
    const delta: number[] = [];
    for (let i = 0; i < n - 1; i++)
      delta.push((this.f[i + 1]! - this.f[i]!) / Math.max(1e-6, this.t[i + 1]! - this.t[i]!));
    const m = new Array<number>(n).fill(0);
    for (let i = 1; i < n - 1; i++) {
      const a = delta[i - 1]!;
      const b = delta[i]!;
      if (a * b <= 0) m[i] = 0;
      else {
        // weighted harmonic mean keeps the curve monotone
        const ha = this.t[i]! - this.t[i - 1]!;
        const hb = this.t[i + 1]! - this.t[i]!;
        const w1 = 2 * hb + ha;
        const w2 = hb + 2 * ha;
        m[i] = (w1 + w2) / (w1 / a + w2 / b);
      }
    }
    this.m = m;
  }

  get duration(): number {
    return this.t[this.t.length - 1]! - this.t[0]!;
  }

  /** Fraction of the path covered at time `time`. */
  fraction(time: number): number {
    const t = this.t;
    const n = t.length;
    if (n === 1 || time <= t[0]!) return this.f[0]!;
    if (time >= t[n - 1]!) return this.f[n - 1]!;
    let i = 0;
    while (i < n - 2 && time > t[i + 1]!) i++;
    const h = t[i + 1]! - t[i]!;
    const s = (time - t[i]!) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (
      (2 * s3 - 3 * s2 + 1) * this.f[i]! +
      (s3 - 2 * s2 + s) * h * this.m[i]! +
      (-2 * s3 + 3 * s2) * this.f[i + 1]! +
      (s3 - s2) * h * this.m[i + 1]!
    );
  }
}

/**
 * CSS-style cubic-bezier easing (x1, y1, x2, y2), e.g. [0.42, 0, 0.58, 1] for ease-in-out.
 * Returns a function from linear progress (0..1) to eased progress.
 */
export function cubicBezierEase(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sy = (u: number) => ((ay * u + by) * u + cy) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Newton's method, falling back to bisection
    let u = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(u) - x;
      if (Math.abs(err) < 1e-6) return sy(u);
      const d = dx(u);
      if (Math.abs(d) < 1e-6) break;
      u -= err / d;
    }
    let lo = 0;
    let hi = 1;
    u = x;
    for (let i = 0; i < 40; i++) {
      const v = sx(u);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = u;
      else hi = u;
      u = (lo + hi) / 2;
    }
    return sy(u);
  };
}
