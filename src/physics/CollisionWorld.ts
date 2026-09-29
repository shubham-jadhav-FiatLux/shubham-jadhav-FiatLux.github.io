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

const CELL = 8;

function key(ix: number, iz: number): number {
  return (ix + 1000) * 4096 + (iz + 1000);
}

function shapeBounds(s: Shape): [number, number, number, number] {
  if (s.type === 'circle') return [s.x - s.r, s.z - s.r, s.x + s.r, s.z + s.r];
  const ext = Math.hypot(s.hx, s.hz);
  return [s.x - ext, s.z - ext, s.x + ext, s.z + ext];
}

/** Whether (x, z) lies inside the shape, optionally grown by `margin`. */
export function shapeContains(s: Shape, x: number, z: number, margin = 0): boolean {
  if (s.type === 'circle') {
    const dx = x - s.x;
    const dz = z - s.z;
    const r = s.r + margin;
    return dx * dx + dz * dz <= r * r;
  }
  const c = Math.cos(s.rot);
  const sn = Math.sin(s.rot);
  const dx = x - s.x;
  const dz = z - s.z;
  const lx = dx * c - dz * sn;
  const lz = dx * sn + dz * c;
  return Math.abs(lx) <= s.hx + margin && Math.abs(lz) <= s.hz + margin;
}

/**
 * Pushes a circle of radius r at (body.x, body.z) out of the shape.
 * Returns true if a correction was applied.
 */
export function pushOut(s: Shape, body: Body, r: number): boolean {
  if (s.type === 'circle') {
    const dx = body.x - s.x;
    const dz = body.z - s.z;
    const min = s.r + r;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min) return false;
    const d = Math.sqrt(d2);
    if (d < 1e-6) {
      body.x = s.x + min;
      return true;
    }
    const k = (min - d) / d;
    body.x += dx * k;
    body.z += dz * k;
    return true;
  }
  const c = Math.cos(s.rot);
  const sn = Math.sin(s.rot);
  const dx = body.x - s.x;
  const dz = body.z - s.z;
  let lx = dx * c - dz * sn;
  let lz = dx * sn + dz * c;
  const cx = Math.max(-s.hx, Math.min(s.hx, lx));
  const cz = Math.max(-s.hz, Math.min(s.hz, lz));
  const ox = lx - cx;
  const oz = lz - cz;
  const d2 = ox * ox + oz * oz;
  if (d2 > 1e-9) {
    if (d2 >= r * r) return false;
    const d = Math.sqrt(d2);
    const k = (r - d) / d;
    lx += ox * k;
    lz += oz * k;
  } else {
    // Centre inside the box: leave through the closest face.
    const px = s.hx - Math.abs(lx);
    const pz = s.hz - Math.abs(lz);
    if (px < pz) lx = Math.sign(lx || 1) * (s.hx + r);
    else lz = Math.sign(lz || 1) * (s.hz + r);
  }
  body.x = s.x + lx * c + lz * sn;
  body.z = s.z - lx * sn + lz * c;
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

  addObstacle(o: Obstacle): Obstacle {
    this.obstacles.push(o);
    this.insert(o.shape, (cell) => cell.obstacles.push(o));
    return o;
  }

  addPlatform(p: Platform): Platform {
    this.platforms.push(p);
    this.insert(p.shape, (cell) => cell.platforms.push(p));
    return p;
  }

  circle(x: number, z: number, r: number, yMin: number, yMax: number, tag?: string): Obstacle {
    return this.addObstacle({ shape: { type: 'circle', x, z, r }, yMin, yMax, tag });
  }

  box(
    x: number,
    z: number,
    hx: number,
    hz: number,
    rot: number,
    yMin: number,
    yMax: number,
    tag?: string,
  ): Obstacle {
    return this.addObstacle({ shape: { type: 'box', x, z, hx, hz, rot }, yMin, yMax, tag });
  }

  private insert(
    shape: Shape,
    add: (cell: { obstacles: Obstacle[]; platforms: Platform[] }) => void,
  ): void {
    const [x0, z0, x1, z1] = shapeBounds(shape);
    for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++) {
      for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
        const k = key(ix, iz);
        let cell = this.grid.get(k);
        if (!cell) {
          cell = { obstacles: [], platforms: [] };
          this.grid.set(k, cell);
        }
        add(cell);
      }
    }
  }

  private forNearby(
    x: number,
    z: number,
    radius: number,
    visit: (cell: { obstacles: Obstacle[]; platforms: Platform[] }) => void,
  ): void {
    for (let ix = Math.floor((x - radius) / CELL); ix <= Math.floor((x + radius) / CELL); ix++) {
      for (let iz = Math.floor((z - radius) / CELL); iz <= Math.floor((z + radius) / CELL); iz++) {
        const cell = this.grid.get(key(ix, iz));
        if (cell) visit(cell);
      }
    }
  }

  /**
   * Resolves horizontal penetration. Platforms that are too tall to step onto act as walls.
   * Returns the tag of the last thing hit (if any), useful for bump reactions.
   */
  resolve(body: Body, radius: number, height: number, stepHeight: number): string | null {
    let hitTag: string | null = null;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      this.seen.clear();
      this.forNearby(body.x, body.z, radius + 1, (cell) => {
        for (const o of cell.obstacles) {
          if (this.seen.has(o)) continue;
          this.seen.add(o);
          if (body.y + height < o.yMin || body.y > o.yMax) continue;
          if (pushOut(o.shape, body, radius)) {
            moved = true;
            hitTag = o.tag ?? hitTag;
          }
        }
        for (const p of cell.platforms) {
          if (this.seen.has(p)) continue;
          this.seen.add(p);
          const canStep = body.y >= p.top - stepHeight;
          if (canStep) continue;
          if (body.y + height < p.bottom) continue;
          if (pushOut(p.shape, body, radius * 0.6)) moved = true;
        }
      });
      if (!moved) break;
    }
    return hitTag;
  }

  /**
   * Highest platform top under (x, z) that the body can stand on
   * (i.e. not higher than y + stepHeight). Returns null when there is none.
   */
  platformAt(x: number, z: number, y: number, stepHeight: number, margin = 0): Platform | null {
    let best: Platform | null = null;
    this.forNearby(x, z, 0.5, (cell) => {
      for (const p of cell.platforms) {
        if (p.top > y + stepHeight) continue;
        if (best && p.top <= best.top) continue;
        if (shapeContains(p.shape, x, z, margin)) best = p;
      }
    });
    return best;
  }

  /** Obstacles whose tag starts with `prefix` within `radius` of (x, z). */
  findTagged(x: number, z: number, radius: number, prefix: string): Obstacle[] {
    const out: Obstacle[] = [];
    this.seen.clear();
    this.forNearby(x, z, radius, (cell) => {
      for (const o of cell.obstacles) {
        if (this.seen.has(o) || !o.tag?.startsWith(prefix)) continue;
        this.seen.add(o);
        if (shapeContains(o.shape, x, z, radius)) out.push(o);
      }
    });
    return out;
  }
}
