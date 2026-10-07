import { distToPolyline } from '../utils/math';
import type { Random } from '../utils/random';
import { lakeSdf, riverAt } from './heightfield';
import { sj_BRIDGE_POINTS, sj_PATHS, sj_PLAY_AREA, sj_RESERVED } from './layout';
import type { Terrain } from './Terrain';

export interface PlacedPoint {
  x: number;
  z: number;
  y: number;
}

export interface ScatterOptions {
  /** bounding box [minX, minZ, maxX, maxZ] */
  bounds: readonly [number, number, number, number];
  /** how many points to try to place */
  count: number;
  /** minimum distance between points of this scatter */
  minDist: number;
  rand: Random;
  /** extra acceptance test, return probability 0..1 */
  density?: (sj_x: number, sj_z: number) => number;
  /** keep this far from paths (m) */
  pathMargin?: number;
  /** keep this far from reserved areas (m, added to their radius) */
  reservedMargin?: number;
  /** lake: 'avoid' (default), 'shore' (only near the waterline) or 'water' */
  lake?: 'avoid' | 'shore' | 'water' | 'any';
  maxSlope?: number;
  /** points already placed by other scatters that must also be respected */
  avoid?: { x: number; z: number; r: number }[];
}

/**
 * Rules for where scenery may grow, plus a dart-throwing Poisson-disk scatter.
 * Keeps vegetation off paths, plazas, buildings and (unless asked) the lake.
 */
export class Placement {
  /** extra areas claimed at runtime (banners, props...) that scatters avoid */
  readonly reserved: { x: number; z: number; r: number }[] = [];

  reserve(sj_x: number, sj_z: number, sj_r: number): void {
    this.reserved.push({ x: sj_x, z: sj_z, r: sj_r });
  }

  constructor(private readonly terrain: Terrain) {}

  distanceToPaths(sj_x: number, sj_z: number): number {
    let sj_best = Infinity;
    for (const sj_p of sj_PATHS)
      sj_best = Math.min(sj_best, distToPolyline(sj_x, sj_z, sj_p.points) - sj_p.width / 2);
    sj_best = Math.min(sj_best, distToPolyline(sj_x, sj_z, sj_BRIDGE_POINTS) - 2);
    return sj_best;
  }

  /** Distance from the stream's banks (negative inside the channel). */
  distanceToStream(sj_x: number, sj_z: number): number {
    const sj_r = riverAt(sj_x, sj_z);
    return sj_r ? sj_r.dist - sj_r.halfWidth - 1.2 : Infinity;
  }

  inReserved(sj_x: number, sj_z: number, sj_margin: number): boolean {
    const sj_hit = (sj_c: { x: number; z: number; r: number }) => {
      const sj_dx = sj_x - sj_c.x;
      const sj_dz = sj_z - sj_c.z;
      const sj_r = sj_c.r + sj_margin;
      return sj_dx * sj_dx + sj_dz * sj_dz < sj_r * sj_r;
    };
    return sj_RESERVED.some(sj_hit) || this.reserved.some(sj_hit);
  }

  insidePlayArea(sj_x: number, sj_z: number, sj_margin = 0): boolean {
    const sj_ex = (sj_x - sj_PLAY_AREA.x) / (sj_PLAY_AREA.rx - sj_margin);
    const sj_ez = (sj_z - sj_PLAY_AREA.z) / (sj_PLAY_AREA.rz - sj_margin);
    return sj_ex * sj_ex + sj_ez * sj_ez < 1;
  }

  scatter(sj_o: ScatterOptions): PlacedPoint[] {
    const sj_out: PlacedPoint[] = [];
    const [sj_x0, sj_z0, sj_x1, sj_z1] = sj_o.bounds;
    const sj_cell = sj_o.minDist / Math.SQRT2;
    const sj_gw = Math.max(1, Math.ceil((sj_x1 - sj_x0) / sj_cell));
    const sj_gh = Math.max(1, Math.ceil((sj_z1 - sj_z0) / sj_cell));
    const sj_grid = new Int32Array(sj_gw * sj_gh).fill(-1);
    const sj_attempts = sj_o.count * 12;
    const sj_pathMargin = sj_o.pathMargin ?? 1;
    const sj_reservedMargin = sj_o.reservedMargin ?? 0;
    const sj_lake = sj_o.lake ?? 'avoid';
    const sj_maxSlope = sj_o.maxSlope ?? 0.45;
    for (let sj_a = 0; sj_a < sj_attempts && sj_out.length < sj_o.count; sj_a++) {
      const sj_x = sj_o.rand.range(sj_x0, sj_x1);
      const sj_z = sj_o.rand.range(sj_z0, sj_z1);
      const sj_gx = Math.floor((sj_x - sj_x0) / sj_cell);
      const sj_gz = Math.floor((sj_z - sj_z0) / sj_cell);
      // min distance within this scatter
      let sj_ok = true;
      for (
        let sj_j = Math.max(0, sj_gz - 2);
        sj_j <= Math.min(sj_gh - 1, sj_gz + 2) && sj_ok;
        sj_j++
      ) {
        for (let sj_i = Math.max(0, sj_gx - 2); sj_i <= Math.min(sj_gw - 1, sj_gx + 2); sj_i++) {
          const sj_k = sj_grid[sj_j * sj_gw + sj_i]!;
          if (sj_k < 0) continue;
          const sj_p = sj_out[sj_k]!;
          if ((sj_p.x - sj_x) ** 2 + (sj_p.z - sj_z) ** 2 < sj_o.minDist * sj_o.minDist) {
            sj_ok = false;
            break;
          }
        }
      }
      if (!sj_ok) continue;
      if (sj_o.density && sj_o.rand.float() > sj_o.density(sj_x, sj_z)) continue;
      const sj_sdf = lakeSdf(sj_x, sj_z);
      if (sj_lake === 'avoid' && sj_sdf < 1.5) continue;
      if (sj_lake === 'shore' && (sj_sdf < -0.5 || sj_sdf > 5)) continue;
      if (sj_lake === 'water' && sj_sdf > -0.5) continue;
      if (this.distanceToPaths(sj_x, sj_z) < sj_pathMargin) continue;
      if (this.distanceToStream(sj_x, sj_z) < 0.6) continue;
      if (this.inReserved(sj_x, sj_z, sj_reservedMargin)) continue;
      if (this.terrain.slopeAt(sj_x, sj_z) > sj_maxSlope) continue;
      if (
        sj_o.avoid &&
        sj_o.avoid.some((sj_c) => (sj_c.x - sj_x) ** 2 + (sj_c.z - sj_z) ** 2 < sj_c.r * sj_c.r)
      )
        continue;
      const sj_k = sj_out.length;
      sj_out.push({ x: sj_x, z: sj_z, y: this.terrain.heightAt(sj_x, sj_z) });
      sj_grid[sj_gz * sj_gw + sj_gx] = sj_k;
    }
    return sj_out;
  }
}
