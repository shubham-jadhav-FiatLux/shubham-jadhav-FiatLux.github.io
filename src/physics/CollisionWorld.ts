import type { Surface } from '../world/layout';

export type Shape =
  | { type: 'circle'; x: number; z: number; r: number }
  | { type: 'box'; x: number; z: number; hx: number; hz: number; rot: number };

/** Something the panda cannot walk through (tree trunk, pillar, wall...). */
export interface Obstacle {
  shape: Shape;
  yMin: number;
  yMax: number;
  tag?: string;
}

/** Something the panda can stand on (bridge deck, steps, stepping stone...). */
export interface Platform {
  shape: Shape;
  top: number;
  /** below this the platform does not block (e.g. swimming under a thin deck) */
  bottom: number;
  surface: Surface;
  tag?: string;
}

export interface Body {
  x: number;
  y: number;
  z: number;
}

const sj_CELL = 8;

function key(sj_ix: number, sj_iz: number): number {
  return (sj_ix + 1000) * 4096 + (sj_iz + 1000);
}

function shapeBounds(sj_s: Shape): [number, number, number, number] {
  if (sj_s.type === 'circle')
    return [sj_s.x - sj_s.r, sj_s.z - sj_s.r, sj_s.x + sj_s.r, sj_s.z + sj_s.r];
  const sj_ext = Math.hypot(sj_s.hx, sj_s.hz);
  return [sj_s.x - sj_ext, sj_s.z - sj_ext, sj_s.x + sj_ext, sj_s.z + sj_ext];
}

/** Whether (x, z) lies inside the shape, optionally grown by `sj_margin`. */
export function shapeContains(sj_s: Shape, sj_x: number, sj_z: number, sj_margin = 0): boolean {
  if (sj_s.type === 'circle') {
    const sj_dx = sj_x - sj_s.x;
    const sj_dz = sj_z - sj_s.z;
    const sj_r = sj_s.r + sj_margin;
    return sj_dx * sj_dx + sj_dz * sj_dz <= sj_r * sj_r;
  }
  const sj_c = Math.cos(sj_s.rot);
  const sj_sn = Math.sin(sj_s.rot);
  const sj_dx = sj_x - sj_s.x;
  const sj_dz = sj_z - sj_s.z;
  const sj_lx = sj_dx * sj_c - sj_dz * sj_sn;
  const sj_lz = sj_dx * sj_sn + sj_dz * sj_c;
  return Math.abs(sj_lx) <= sj_s.hx + sj_margin && Math.abs(sj_lz) <= sj_s.hz + sj_margin;
}

/**
 * Pushes a circle of radius r at (body.x, body.z) out of the shape.
 * Returns true if a correction was applied.
 */
export function pushOut(sj_s: Shape, sj_body: Body, sj_r: number): boolean {
  if (sj_s.type === 'circle') {
    const sj_dx = sj_body.x - sj_s.x;
    const sj_dz = sj_body.z - sj_s.z;
    const sj_min = sj_s.r + sj_r;
    const sj_d2 = sj_dx * sj_dx + sj_dz * sj_dz;
    if (sj_d2 >= sj_min * sj_min) return false;
    const sj_d = Math.sqrt(sj_d2);
    if (sj_d < 1e-6) {
      sj_body.x = sj_s.x + sj_min;
      return true;
    }
    const sj_k = (sj_min - sj_d) / sj_d;
    sj_body.x += sj_dx * sj_k;
    sj_body.z += sj_dz * sj_k;
    return true;
  }
  const sj_c = Math.cos(sj_s.rot);
  const sj_sn = Math.sin(sj_s.rot);
  const sj_dx = sj_body.x - sj_s.x;
  const sj_dz = sj_body.z - sj_s.z;
  let sj_lx = sj_dx * sj_c - sj_dz * sj_sn;
  let sj_lz = sj_dx * sj_sn + sj_dz * sj_c;
  const sj_cx = Math.max(-sj_s.hx, Math.min(sj_s.hx, sj_lx));
  const sj_cz = Math.max(-sj_s.hz, Math.min(sj_s.hz, sj_lz));
  const sj_ox = sj_lx - sj_cx;
  const sj_oz = sj_lz - sj_cz;
  const sj_d2 = sj_ox * sj_ox + sj_oz * sj_oz;
  if (sj_d2 > 1e-9) {
    if (sj_d2 >= sj_r * sj_r) return false;
    const sj_d = Math.sqrt(sj_d2);
    const sj_k = (sj_r - sj_d) / sj_d;
    sj_lx += sj_ox * sj_k;
    sj_lz += sj_oz * sj_k;
  } else {
    // Centre inside the box: leave through the closest face.
    const sj_px = sj_s.hx - Math.abs(sj_lx);
    const sj_pz = sj_s.hz - Math.abs(sj_lz);
    if (sj_px < sj_pz) sj_lx = Math.sign(sj_lx || 1) * (sj_s.hx + sj_r);
    else sj_lz = Math.sign(sj_lz || 1) * (sj_s.hz + sj_r);
  }
  sj_body.x = sj_s.x + sj_lx * sj_c + sj_lz * sj_sn;
  sj_body.z = sj_s.z - sj_lx * sj_sn + sj_lz * sj_c;
  return true;
}

/**
 * Static collision world with a uniform-grid broadphase. The panda is a vertical capsule
 * approximated by a circle (radius) spanning [y, y + height].
 */
export class CollisionWorld {
  readonly obstacles: Obstacle[] = [];
  readonly platforms: Platform[] = [];
  private grid = new Map<number, { obstacles: Obstacle[]; platforms: Platform[] }>();
  private seen = new Set<object>();

  addObstacle(sj_o: Obstacle): Obstacle {
    this.obstacles.push(sj_o);
    this.insert(sj_o.shape, (sj_cell) => sj_cell.obstacles.push(sj_o));
    return sj_o;
  }

  addPlatform(sj_p: Platform): Platform {
    this.platforms.push(sj_p);
    this.insert(sj_p.shape, (sj_cell) => sj_cell.platforms.push(sj_p));
    return sj_p;
  }

  circle(
    sj_x: number,
    sj_z: number,
    sj_r: number,
    sj_yMin: number,
    sj_yMax: number,
    sj_tag?: string,
  ): Obstacle {
    return this.addObstacle({
      shape: { type: 'circle', x: sj_x, z: sj_z, r: sj_r },
      yMin: sj_yMin,
      yMax: sj_yMax,
      tag: sj_tag,
    });
  }

  box(
    sj_x: number,
    sj_z: number,
    sj_hx: number,
    sj_hz: number,
    sj_rot: number,
    sj_yMin: number,
    sj_yMax: number,
    sj_tag?: string,
  ): Obstacle {
    return this.addObstacle({
      shape: { type: 'box', x: sj_x, z: sj_z, hx: sj_hx, hz: sj_hz, rot: sj_rot },
      yMin: sj_yMin,
      yMax: sj_yMax,
      tag: sj_tag,
    });
  }

  private insert(
    sj_shape: Shape,
    sj_add: (sj_cell: { obstacles: Obstacle[]; platforms: Platform[] }) => void,
  ): void {
    const [sj_x0, sj_z0, sj_x1, sj_z1] = shapeBounds(sj_shape);
    for (let sj_ix = Math.floor(sj_x0 / sj_CELL); sj_ix <= Math.floor(sj_x1 / sj_CELL); sj_ix++) {
      for (let sj_iz = Math.floor(sj_z0 / sj_CELL); sj_iz <= Math.floor(sj_z1 / sj_CELL); sj_iz++) {
        const sj_k = key(sj_ix, sj_iz);
        let sj_cell = this.grid.get(sj_k);
        if (!sj_cell) {
          sj_cell = { obstacles: [], platforms: [] };
          this.grid.set(sj_k, sj_cell);
        }
        sj_add(sj_cell);
      }
    }
  }

  private forNearby(
    sj_x: number,
    sj_z: number,
    sj_radius: number,
    sj_visit: (sj_cell: { obstacles: Obstacle[]; platforms: Platform[] }) => void,
  ): void {
    for (
      let sj_ix = Math.floor((sj_x - sj_radius) / sj_CELL);
      sj_ix <= Math.floor((sj_x + sj_radius) / sj_CELL);
      sj_ix++
    ) {
      for (
        let sj_iz = Math.floor((sj_z - sj_radius) / sj_CELL);
        sj_iz <= Math.floor((sj_z + sj_radius) / sj_CELL);
        sj_iz++
      ) {
        const sj_cell = this.grid.get(key(sj_ix, sj_iz));
        if (sj_cell) sj_visit(sj_cell);
      }
    }
  }

  /**
   * Resolves horizontal penetration. Platforms that are too tall to step onto act as walls.
   * Returns the tag of the last thing hit (if any), useful for bump reactions.
   */
  resolve(
    sj_body: Body,
    sj_radius: number,
    sj_height: number,
    sj_stepHeight: number,
  ): string | null {
    let sj_hitTag: string | null = null;
    for (let sj_iter = 0; sj_iter < 3; sj_iter++) {
      let sj_moved = false;
      this.seen.clear();
      this.forNearby(sj_body.x, sj_body.z, sj_radius + 1, (sj_cell) => {
        for (const sj_o of sj_cell.obstacles) {
          if (this.seen.has(sj_o)) continue;
          this.seen.add(sj_o);
          if (sj_body.y + sj_height < sj_o.yMin || sj_body.y > sj_o.yMax) continue;
          if (pushOut(sj_o.shape, sj_body, sj_radius)) {
            sj_moved = true;
            sj_hitTag = sj_o.tag ?? sj_hitTag;
          }
        }
        for (const sj_p of sj_cell.platforms) {
          if (this.seen.has(sj_p)) continue;
          this.seen.add(sj_p);
          const sj_canStep = sj_body.y >= sj_p.top - sj_stepHeight;
          if (sj_canStep) continue;
          if (sj_body.y + sj_height < sj_p.bottom) continue;
          if (pushOut(sj_p.shape, sj_body, sj_radius * 0.6)) sj_moved = true;
        }
      });
      if (!sj_moved) break;
    }
    return sj_hitTag;
  }

  /**
   * Highest platform top under (x, z) that the body can stand on
   * (i.e. not higher than y + stepHeight). Returns null when there is none.
   */
  platformAt(
    sj_x: number,
    sj_z: number,
    sj_y: number,
    sj_stepHeight: number,
    sj_margin = 0,
  ): Platform | null {
    let sj_best: Platform | null = null;
    this.forNearby(sj_x, sj_z, 0.5, (sj_cell) => {
      for (const sj_p of sj_cell.platforms) {
        if (sj_p.top > sj_y + sj_stepHeight) continue;
        if (sj_best && sj_p.top <= sj_best.top) continue;
        if (shapeContains(sj_p.shape, sj_x, sj_z, sj_margin)) sj_best = sj_p;
      }
    });
    return sj_best;
  }

  /** Obstacles whose tag starts with `sj_prefix` within `sj_radius` of (x, z). */
  findTagged(sj_x: number, sj_z: number, sj_radius: number, sj_prefix: string): Obstacle[] {
    const sj_out: Obstacle[] = [];
    this.seen.clear();
    this.forNearby(sj_x, sj_z, sj_radius, (sj_cell) => {
      for (const sj_o of sj_cell.obstacles) {
        if (this.seen.has(sj_o) || !sj_o.tag?.startsWith(sj_prefix)) continue;
        this.seen.add(sj_o);
        if (shapeContains(sj_o.shape, sj_x, sj_z, sj_radius)) sj_out.push(sj_o);
      }
    });
    return sj_out;
  }
}
