/** A polyline on the ground (x, z) with arc-length lookups, for walking the panda. */
export type XZ = readonly [number, number];

export class Route {
  readonly points: XZ[];
  /** cumulative length at each point */
  private readonly acc: number[];
  readonly length: number;

  constructor(sj_points: readonly XZ[]) {
    if (sj_points.length < 2) throw new Error('a route needs at least two points');
    this.points = sj_points.slice();
    this.acc = [0];
    for (let sj_i = 1; sj_i < sj_points.length; sj_i++) {
      const [sj_ax, sj_az] = sj_points[sj_i - 1]!;
      const [sj_bx, sj_bz] = sj_points[sj_i]!;
      this.acc.push(this.acc[sj_i - 1]! + Math.hypot(sj_bx - sj_ax, sj_bz - sj_az));
    }
    this.length = this.acc[this.acc.length - 1]!;
  }

  get start(): XZ {
    return this.points[0]!;
  }

  get end(): XZ {
    return this.points[this.points.length - 1]!;
  }

  /** Point at distance `sj_s` along the route (clamped to its ends). */
  at(sj_s: number, sj_out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
    const sj_d = Math.min(this.length, Math.max(0, sj_s));
    let sj_i = 1;
    while (sj_i < this.acc.length - 1 && this.acc[sj_i]! < sj_d) sj_i++;
    const sj_s0 = this.acc[sj_i - 1]!;
    const sj_seg = this.acc[sj_i]! - sj_s0;
    const sj_t = sj_seg > 0 ? (sj_d - sj_s0) / sj_seg : 0;
    const [sj_ax, sj_az] = this.points[sj_i - 1]!;
    const [sj_bx, sj_bz] = this.points[sj_i]!;
    sj_out.x = sj_ax + (sj_bx - sj_ax) * sj_t;
    sj_out.z = sj_az + (sj_bz - sj_az) * sj_t;
    return sj_out;
  }

  /** Direction of travel (unit x, z) at distance `sj_s`. */
  heading(sj_s: number): { x: number; z: number } {
    const sj_a = this.at(sj_s - 0.5);
    const sj_b = this.at(sj_s + 0.5);
    const sj_len = Math.hypot(sj_b.x - sj_a.x, sj_b.z - sj_a.z) || 1;
    return { x: (sj_b.x - sj_a.x) / sj_len, z: (sj_b.z - sj_a.z) / sj_len };
  }

  /**
   * Distance along the route of the point closest to (x, z). `sj_from` limits the search to
   * the part of the route at or after that distance, so a route that doubles back is
   * followed in order.
   */
  project(sj_x: number, sj_z: number, sj_from = 0): number {
    let sj_best = Infinity;
    let sj_bestS = sj_from;
    for (let sj_i = 1; sj_i < this.points.length; sj_i++) {
      if (this.acc[sj_i]! < sj_from) continue;
      const [sj_ax, sj_az] = this.points[sj_i - 1]!;
      const [sj_bx, sj_bz] = this.points[sj_i]!;
      const sj_abx = sj_bx - sj_ax;
      const sj_abz = sj_bz - sj_az;
      const sj_len2 = sj_abx * sj_abx + sj_abz * sj_abz;
      let sj_t = sj_len2 > 0 ? ((sj_x - sj_ax) * sj_abx + (sj_z - sj_az) * sj_abz) / sj_len2 : 0;
      sj_t = Math.min(1, Math.max(0, sj_t));
      const sj_s = this.acc[sj_i - 1]! + sj_t * Math.sqrt(sj_len2);
      if (sj_s < sj_from) continue;
      const sj_d = Math.hypot(sj_ax + sj_abx * sj_t - sj_x, sj_az + sj_abz * sj_t - sj_z);
      if (sj_d < sj_best) {
        sj_best = sj_d;
        sj_bestS = sj_s;
      }
    }
    return sj_bestS;
  }
}

/** Point `sj_dist` metres from (x, z) towards (tx, tz): where to stand in front of something. */
export function approach(
  sj_x: number,
  sj_z: number,
  sj_tx: number,
  sj_tz: number,
  sj_dist: number,
): [number, number] {
  const sj_dx = sj_x - sj_tx;
  const sj_dz = sj_z - sj_tz;
  const sj_len = Math.hypot(sj_dx, sj_dz) || 1;
  return [sj_tx + (sj_dx / sj_len) * sj_dist, sj_tz + (sj_dz / sj_len) * sj_dist];
}
