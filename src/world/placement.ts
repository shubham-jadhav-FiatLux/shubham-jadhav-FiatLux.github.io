import { distToPolyline } from '../utils/math';
import type { Random } from '../utils/random';
import { lakeSdf } from './heightfield';
import { BRIDGE_POINTS, PATHS, PLAY_AREA, RESERVED } from './layout';
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
  density?: (x: number, z: number) => number;
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

  reserve(x: number, z: number, r: number): void {
    this.reserved.push({ x, z, r });
  }

  constructor(private readonly terrain: Terrain) {}

  distanceToPaths(x: number, z: number): number {
    let best = Infinity;
    for (const p of PATHS) best = Math.min(best, distToPolyline(x, z, p.points) - p.width / 2);
    best = Math.min(best, distToPolyline(x, z, BRIDGE_POINTS) - 2);
    return best;
  }

  inReserved(x: number, z: number, margin: number): boolean {
    const hit = (c: { x: number; z: number; r: number }) => {
      const dx = x - c.x;
      const dz = z - c.z;
      const r = c.r + margin;
      return dx * dx + dz * dz < r * r;
    };
    return RESERVED.some(hit) || this.reserved.some(hit);
  }

  insidePlayArea(x: number, z: number, margin = 0): boolean {
    const ex = (x - PLAY_AREA.x) / (PLAY_AREA.rx - margin);
    const ez = (z - PLAY_AREA.z) / (PLAY_AREA.rz - margin);
    return ex * ex + ez * ez < 1;
  }

  scatter(o: ScatterOptions): PlacedPoint[] {
    const out: PlacedPoint[] = [];
    const [x0, z0, x1, z1] = o.bounds;
    const cell = o.minDist / Math.SQRT2;
    const gw = Math.max(1, Math.ceil((x1 - x0) / cell));
    const gh = Math.max(1, Math.ceil((z1 - z0) / cell));
    const grid = new Int32Array(gw * gh).fill(-1);
    const attempts = o.count * 12;
    const pathMargin = o.pathMargin ?? 1;
    const reservedMargin = o.reservedMargin ?? 0;
    const lake = o.lake ?? 'avoid';
    const maxSlope = o.maxSlope ?? 0.45;
    for (let a = 0; a < attempts && out.length < o.count; a++) {
      const x = o.rand.range(x0, x1);
      const z = o.rand.range(z0, z1);
      const gx = Math.floor((x - x0) / cell);
      const gz = Math.floor((z - z0) / cell);
      // min distance within this scatter
      let ok = true;
      for (let j = Math.max(0, gz - 2); j <= Math.min(gh - 1, gz + 2) && ok; j++) {
        for (let i = Math.max(0, gx - 2); i <= Math.min(gw - 1, gx + 2); i++) {
          const k = grid[j * gw + i]!;
          if (k < 0) continue;
          const p = out[k]!;
          if ((p.x - x) ** 2 + (p.z - z) ** 2 < o.minDist * o.minDist) {
            ok = false;
            break;
          }
        }
      }
      if (!ok) continue;
      if (o.density && o.rand.float() > o.density(x, z)) continue;
      const sdf = lakeSdf(x, z);
      if (lake === 'avoid' && sdf < 1.5) continue;
      if (lake === 'shore' && (sdf < -0.5 || sdf > 5)) continue;
      if (lake === 'water' && sdf > -0.5) continue;
      if (this.distanceToPaths(x, z) < pathMargin) continue;
      if (this.inReserved(x, z, reservedMargin)) continue;
      if (this.terrain.slopeAt(x, z) > maxSlope) continue;
      if (o.avoid && o.avoid.some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < c.r * c.r)) continue;
      const k = out.length;
      out.push({ x, z, y: this.terrain.heightAt(x, z) });
      grid[gz * gw + gx] = k;
    }
    return out;
  }
}
