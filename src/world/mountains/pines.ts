/**
 * Small pines for the mountain tops, like the ones clinging to the peaks of Huangshan in
 * ink paintings: a crooked trunk leaning out over the drop and flat, layered pads of
 * needles. Plain vertex arrays (no three.js); merged into the mountain meshes.
 */
import { Random } from '../../utils/random';
import type { PeakMesh } from './peaks';

/** One squashed, slightly irregular ellipsoid pad, as a ring-and-poles mesh. */
function pad(
  out: Builder,
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
  rand: Random,
): void {
  const around = 7;
  const start = out.count;
  const rot = rand.range(0, Math.PI * 2);
  out.vertex(cx, cy + ry, cz);
  // upper ring, equator, lower ring
  const rings = [
    { y: 0.55, r: 0.72 },
    { y: 0, r: 1 },
    { y: -0.6, r: 0.62 },
  ];
  for (const ring of rings) {
    for (let j = 0; j < around; j++) {
      const a = rot + (j / around) * Math.PI * 2;
      const wobble = 1 + rand.spread(0.18);
      out.vertex(
        cx + Math.cos(a) * rx * ring.r * wobble,
        cy + ring.y * ry,
        cz + Math.sin(a) * rz * ring.r * wobble,
      );
    }
  }
  out.vertex(cx, cy - ry * 0.85, cz);
  const top = start;
  const bottom = start + 1 + around * 3;
  const ringStart = (k: number) => start + 1 + k * around;
  for (let j = 0; j < around; j++) {
    const j1 = (j + 1) % around;
    out.tri(top, ringStart(0) + j1, ringStart(0) + j);
    for (let k = 0; k < 2; k++) {
      const a = ringStart(k) + j;
      const b = ringStart(k) + j1;
      const c = ringStart(k + 1) + j;
      const d = ringStart(k + 1) + j1;
      out.tri(a, b, c);
      out.tri(b, d, c);
    }
    out.tri(bottom, ringStart(2) + j, ringStart(2) + j1);
  }
}

/** A tapered five-sided limb from a to b. */
function limb(
  out: Builder,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  r0: number,
  r1: number,
): void {
  const sides = 5;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz) || 1;
  // a frame around the limb's axis
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  let px = -uz;
  const py = 0;
  let pz = ux;
  const pl = Math.hypot(px, py, pz);
  if (pl < 1e-4) {
    px = 1;
    pz = 0;
  } else {
    px /= pl;
    pz /= pl;
  }
  // q = u x p
  const qx = uy * pz - uz * py;
  const qy = uz * px - ux * pz;
  const qz = ux * py - uy * px;
  const start = out.count;
  for (let end = 0; end < 2; end++) {
    const r = end ? r1 : r0;
    const cx = end ? bx : ax;
    const cy = end ? by : ay;
    const cz = end ? bz : az;
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const c = Math.cos(a) * r;
      const s = Math.sin(a) * r;
      out.vertex(cx + px * c + qx * s, cy + py * c + qy * s, cz + pz * c + qz * s);
    }
  }
  for (let j = 0; j < sides; j++) {
    const j1 = (j + 1) % sides;
    out.tri(start + j, start + j1, start + sides + j);
    out.tri(start + j1, start + sides + j1, start + sides + j);
  }
}

/** An open cone (no base), apex up. */
function cone(
  out: Builder,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  height: number,
  rand: Random,
): void {
  const sides = 6;
  const start = out.count;
  const rot = rand.range(0, Math.PI * 2);
  for (let j = 0; j < sides; j++) {
    const a = rot + (j / sides) * Math.PI * 2;
    const r = radius * (1 + rand.spread(0.12));
    out.vertex(cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r);
  }
  out.vertex(cx, cy + height, cz);
  for (let j = 0; j < sides; j++) {
    out.tri(start + j, start + sides, start + ((j + 1) % sides));
  }
}

class Builder {
  positions: number[] = [];
  indices: number[] = [];
  get count(): number {
    return this.positions.length / 3;
  }
  vertex(x: number, y: number, z: number): void {
    this.positions.push(x, y, z);
  }
  tri(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }
}

/**
 * A pine rooted at (x, y, z), `height` metres tall, leaning out along (ox, oz) by up to
 * `reach` (0 = upright, 1 = growing almost sideways out of a cliff).
 */
export function buildPine(
  x: number,
  y: number,
  z: number,
  height: number,
  ox: number,
  oz: number,
  reach: number,
  seed: number,
): PeakMesh {
  const rand = new Random(seed);
  const out = new Builder();
  const lean = reach * rand.range(0.5, 1);
  // trunk: out over the drop, then turning up
  const midX = x + ox * height * 0.32 * lean;
  const midZ = z + oz * height * 0.32 * lean;
  const midY = y + height * (0.34 - 0.12 * lean);
  const topX = midX + ox * height * 0.22 * lean + rand.spread(0.08) * height;
  const topZ = midZ + oz * height * 0.22 * lean + rand.spread(0.08) * height;
  const topY = y + height * (0.78 - 0.18 * lean);
  const thick = height * 0.045;
  limb(out, x, y - height * 0.1, z, midX, midY, midZ, thick, thick * 0.75);
  limb(out, midX, midY, midZ, topX, topY, topZ, thick * 0.75, thick * 0.4);
  // pads: a big flat crown and two or three tiers below it, offset like branches
  const tiers = rand.int(3, 4);
  const crown = height * rand.range(0.27, 0.35);
  pad(out, topX, topY, topZ, crown, crown * 0.4, crown * rand.range(0.75, 1), rand);
  for (let k = 0; k < tiers; k++) {
    const f = (k + 1) / (tiers + 1);
    const along = 1 - f * 0.75;
    const bx = midX + (topX - midX) * along;
    const by = midY + (topY - midY) * along - f * height * 0.12;
    const bz = midZ + (topZ - midZ) * along;
    const side = rand.range(0, Math.PI * 2);
    const reachOut = height * rand.range(0.18, 0.32);
    const px = bx + Math.cos(side) * reachOut + ox * height * 0.12;
    const pz = bz + Math.sin(side) * reachOut + oz * height * 0.12;
    const r = crown * rand.range(0.6, 0.85);
    pad(out, px, by, pz, r, r * 0.4, r * rand.range(0.7, 1), rand);
  }
  return finish(out);
}

/**
 * A clump of scrub: a rounded lump of foliage half sunk into the rock. Hundreds of them
 * give the crowns and ledges of the peaks their wooded, broken outline.
 */
export function buildShrub(
  x: number,
  y: number,
  z: number,
  radius: number,
  ox: number,
  oz: number,
  seed: number,
): PeakMesh {
  const rand = new Random(seed);
  const out = new Builder();
  const around = 6;
  const cx = x + ox * radius * 0.35;
  const cz = z + oz * radius * 0.35;
  const cy = y + radius * 0.1;
  const rot = rand.range(0, Math.PI * 2);
  const tall = rand.range(0.65, 0.95);
  out.vertex(cx, cy + radius * tall, cz);
  const rings = [
    { y: 0.5 * tall, r: 0.72 },
    { y: 0, r: 1 },
  ];
  for (const ring of rings) {
    for (let j = 0; j < around; j++) {
      const a = rot + ((j + (ring.y > 0 ? 0.5 : 0)) / around) * Math.PI * 2;
      const r = radius * ring.r * (1 + rand.spread(0.2));
      out.vertex(
        cx + Math.cos(a) * r,
        cy + ring.y * radius + rand.spread(0.1) * radius,
        cz + Math.sin(a) * r,
      );
    }
  }
  out.vertex(cx, cy - radius * 0.7, cz);
  // Shade the clump mostly like the face it grows on, so scrub reads as part of the
  // mountain's mass instead of as separate lit spots.
  const ol = Math.hypot(ox, 0.5, oz);
  const fx = ox / ol;
  const fy = 0.5 / ol;
  const fz = oz / ol;
  const normals: number[] = [];
  for (let v = 0; v < out.count; v++) {
    let nx = out.positions[v * 3]! - cx;
    let ny = out.positions[v * 3 + 1]! - cy;
    let nz = out.positions[v * 3 + 2]! - cz;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx = (nx / l) * 0.4 + fx * 0.6;
    ny = (ny / l) * 0.4 + fy * 0.6;
    nz = (nz / l) * 0.4 + fz * 0.6;
    const m = Math.hypot(nx, ny, nz) || 1;
    normals.push(nx / m, ny / m, nz / m);
  }
  const ring0 = 1;
  const ring1 = 1 + around;
  const bottom = 1 + around * 2;
  for (let j = 0; j < around; j++) {
    const j1 = (j + 1) % around;
    out.tri(0, ring0 + j1, ring0 + j);
    // the upper ring is offset by half a step: stitch it to the equator with a zig-zag
    out.tri(ring0 + j, ring0 + j1, ring1 + j1);
    out.tri(ring0 + j, ring1 + j1, ring1 + j);
    out.tri(bottom, ring1 + j, ring1 + j1);
  }
  return { ...finish(out), normals: new Float32Array(normals) };
}

/** A plain conifer of stacked cones, for the forested foothills. */
export function buildConifer(x: number, y: number, z: number, height: number, seed: number) {
  const rand = new Random(seed);
  const out = new Builder();
  const tiers = 3;
  const width = height * rand.range(0.22, 0.3);
  for (let k = 0; k < tiers; k++) {
    const f = k / tiers;
    const r = width * (1 - f * 0.45);
    const bottom = y + height * (0.12 + f * 0.27);
    cone(out, x, bottom, z, r, height * (0.5 - f * 0.08), rand);
  }
  return finish(out);
}

function finish(out: Builder): PeakMesh {
  const positions = new Float32Array(out.positions);
  const info = new Float32Array(out.count * 3);
  for (let i = 0; i < out.count; i++) {
    info[i * 3] = 0;
    info[i * 3 + 1] = 1;
    // > 1: always vegetation, never rock
    info[i * 3 + 2] = 2;
  }
  return { positions, info, indices: new Uint32Array(out.indices) };
}
