/** A polyline on the ground (x, z) with arc-length lookups, for walking the panda. */
export type XZ = readonly [number, number];

export class Route {
  readonly points: XZ[];
  /** cumulative length at each point */
  private readonly acc: number[];
  readonly length: number;

  constructor(points: readonly XZ[]) {
    if (points.length < 2) throw new Error('a route needs at least two points');
    this.points = points.slice();
    this.acc = [0];
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1]!;
      const [bx, bz] = points[i]!;
      this.acc.push(this.acc[i - 1]! + Math.hypot(bx - ax, bz - az));
    }
    this.length = this.acc[this.acc.length - 1]!;
  }

  get start(): XZ {
    return this.points[0]!;
  }

  get end(): XZ {
    return this.points[this.points.length - 1]!;
  }

  /** Point at distance `s` along the route (clamped to its ends). */
  at(s: number, out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
    const d = Math.min(this.length, Math.max(0, s));
    let i = 1;
    while (i < this.acc.length - 1 && this.acc[i]! < d) i++;
    const s0 = this.acc[i - 1]!;
    const seg = this.acc[i]! - s0;
    const t = seg > 0 ? (d - s0) / seg : 0;
    const [ax, az] = this.points[i - 1]!;
    const [bx, bz] = this.points[i]!;
    out.x = ax + (bx - ax) * t;
    out.z = az + (bz - az) * t;
    return out;
  }

  /** Direction of travel (unit x, z) at distance `s`. */
  heading(s: number): { x: number; z: number } {
    const a = this.at(s - 0.5);
    const b = this.at(s + 0.5);
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
  }

  /**
   * Distance along the route of the point closest to (x, z). `from` limits the search to
   * the part of the route at or after that distance, so a route that doubles back is
   * followed in order.
   */
  project(x: number, z: number, from = 0): number {
    let best = Infinity;
    let bestS = from;
    for (let i = 1; i < this.points.length; i++) {
      if (this.acc[i]! < from) continue;
      const [ax, az] = this.points[i - 1]!;
      const [bx, bz] = this.points[i]!;
      const abx = bx - ax;
      const abz = bz - az;
      const len2 = abx * abx + abz * abz;
      let t = len2 > 0 ? ((x - ax) * abx + (z - az) * abz) / len2 : 0;
      t = Math.min(1, Math.max(0, t));
      const s = this.acc[i - 1]! + t * Math.sqrt(len2);
      if (s < from) continue;
      const d = Math.hypot(ax + abx * t - x, az + abz * t - z);
      if (d < best) {
        best = d;
        bestS = s;
      }
    }
    return bestS;
  }
}

/** Point `dist` metres from (x, z) towards (tx, tz): where to stand in front of something. */
export function approach(
  x: number,
  z: number,
  tx: number,
  tz: number,
  dist: number,
): [number, number] {
  const dx = x - tx;
  const dz = z - tz;
  const len = Math.hypot(dx, dz) || 1;
  return [tx + (dx / len) * dist, tz + (dz / len) * dist];
}
