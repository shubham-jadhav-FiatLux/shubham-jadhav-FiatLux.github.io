/**
 * Mountain peak shapes, as plain vertex arrays (no three.js, so they are unit tested).
 *
 * A peak is a stack of rings from a hidden base up to a single summit vertex. Each ring's
 * radius comes from a height profile (the silhouette of the kind of peak) times a
 * cross-section that varies around the peak (bulges, vertical flutes, spurs) and with
 * height, and the rings drift sideways so a peak can lean. This gives the irregular,
 * characterful outlines of the karst towers and granite spires of Chinese landscapes
 * rather than a smooth cone.
 */
import { SimplexNoise } from '../../utils/noise';
import { Random } from '../../utils/random';
import { smoothstep } from '../../utils/math';

export type PeakKind = 'karst' | 'spire' | 'massif' | 'dome';

export interface PeakSpec {
  kind: PeakKind;
  /** centre of the footprint */
  x: number;
  z: number;
  /** height of the lowest ring (m); keep it below anything the camera can see */
  base: number;
  /** summit above `base` (m) */
  height: number;
  /** footprint radius (m) */
  radius: number;
  /** sideways drift of the summit, as a fraction of the height */
  lean: number;
  /** direction of that drift (radians, atan2(z, x)) */
  leanAngle: number;
  seed: number;
}

export interface Resolution {
  /** vertices around each ring */
  around: number;
  /** rings from the base to just below the summit */
  rings: number;
}

/** A place on a peak where a pine could cling. */
export interface Perch {
  x: number;
  y: number;
  z: number;
  /** horizontal outward direction (unit) */
  ox: number;
  oz: number;
  /** height fraction on the peak (0 = base, 1 = summit) */
  t: number;
}

export interface PeakMesh {
  /** xyz per vertex */
  positions: Float32Array;
  /** optional normals; computed from the faces when absent */
  normals?: Float32Array;
  /** per vertex: x = rock tint of this peak (0..1), y = height fraction, z = vegetation */
  info: Float32Array;
  indices: Uint32Array;
}

/** How much of each kind is covered in trees and scrub (the shader adds slope and noise). */
export const VEGETATION: Record<PeakKind, number> = {
  karst: 0.95,
  spire: 0.55,
  massif: 0.7,
  dome: 1,
};

const noise = new SimplexNoise(7340);

/** Shortest signed difference between two angles. */
function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * The shape of one peak: `profile(t)` is its silhouette (radius fraction at height fraction
 * t), `section(theta, t, y, r)` scales that radius around the peak.
 */
export interface PeakShape {
  profile(t: number): number;
  section(theta: number, t: number, y: number, r: number): number;
  /** height fractions where the outline steps in, leaving a ledge */
  ledges: number[];
}

export function makeShape(spec: PeakSpec): PeakShape {
  const rand = new Random(spec.seed * 7 + 3);
  const ox = rand.range(-500, 500);
  const oy = rand.range(-500, 500);
  const oz = rand.range(-500, 500);
  // 3D noise sampled on the surface itself (metres), so features keep a natural size
  // whatever the size of the peak and close up smoothly towards the summit.
  const surface = (c: number, s: number, y: number, r: number, size: number, stretch: number) =>
    noise.fbm3((c * r) / size + ox, y / (size * stretch) + oy, (s * r) / size + oz, 3);

  // Ledges: the outline steps in at a few heights, like a stack of eroded blocks.
  const ledges = Array.from({ length: rand.int(1, 3) }, () => ({
    at: rand.range(0.3, 0.8),
    depth: rand.range(0.05, 0.12),
  }));
  const stepped = (t: number) => {
    let k = 1;
    for (const l of ledges) k -= l.depth * smoothstep(l.at - 0.015, l.at + 0.015, t);
    return k;
  };
  const ledgeHeights = ledges.map((l) => l.at + 0.02);

  switch (spec.kind) {
    case 'karst': {
      // Sheer sides, a rounded crown, a little scree at the foot; the upper part may bulge
      // a little, like the towers of Guilin. Some are pillars instead, with near-vertical
      // walls and a wooded, almost flat top, like those of Zhangjiajie.
      const pillar = rand.chance(0.4);
      const p = pillar ? rand.range(7, 13) : rand.range(2.8, 5.2);
      const q = pillar ? rand.range(0.22, 0.32) : rand.range(0.3, 0.5);
      const flare = rand.range(0.2, 0.55);
      const bulge = rand.range(0, 0.08);
      const size = rand.range(12, 19);
      return {
        profile(t) {
          const core = Math.pow(Math.max(0, 1 - Math.pow(t, p)), q);
          const foot = 1 + flare * Math.pow(1 - t, 6);
          const belly = 1 + bulge * Math.sin(Math.PI * smoothstep(0.35, 0.95, t));
          return core * foot * belly * stepped(t);
        },
        section(theta, t, y, r) {
          const c = Math.cos(theta);
          const s = Math.sin(theta);
          // big lumps, then vertical flutes cut by rain
          const lumps = surface(c, s, y, r, size * 1.8, 1.8);
          const flute = Math.abs(noise.noise3((c * r) / 6 + oz, y / 38 + ox, (s * r) / 6 + oy));
          const groove = 1 - smoothstep(0, 0.24, flute);
          return Math.max(0.35, 1 + lumps * 0.24 - groove * 0.12 * (1 - t * 0.6));
        },
        ledges: ledgeHeights,
      };
    }
    case 'spire': {
      // A sandstone or granite pinnacle: columnar, then tapering to a broken point; deep
      // vertical joints split it into pillars.
      const p = rand.range(1.6, 2.6);
      const q = rand.range(0.6, 0.85);
      const taper = rand.range(0.2, 0.4);
      const size = rand.range(7, 11);
      // whole number, so the pattern closes up around the spire without a seam
      const joints = rand.int(3, 5);
      // the tip is broken off rather than sharp
      const cut = rand.range(0.93, 0.98);
      return {
        profile(t) {
          const tt = Math.min(t, cut);
          const core = Math.pow(Math.max(0, 1 - Math.pow(tt, p)), q) * (1 - taper * tt);
          return t >= 1 ? 0 : core * (1 + 0.45 * Math.pow(1 - t, 7)) * stepped(t);
        },
        section(theta, t, y, r) {
          const c = Math.cos(theta);
          const s = Math.sin(theta);
          const lumps = surface(c, s, y, r, size * 1.6, 2.2);
          // pillars: a ridged pattern around the spire that wanders with height
          const wander = noise.noise2(y / 40 + ox, oz) * 0.9;
          const pillar = Math.abs(Math.sin(theta * joints + wander));
          const joint = 1 - smoothstep(0, 0.3, pillar);
          return Math.max(0.3, 1 + lumps * 0.3 - joint * 0.16 * (1 - t * 0.4));
        },
        ledges: ledgeHeights,
      };
    }
    case 'massif': {
      // A big mountain with a sharp summit and three to five ridges (aretes) running
      // down into spurs.
      const steep = rand.range(1.05, 1.4);
      const ridges = Array.from({ length: rand.int(3, 5) }, () => ({
        angle: rand.range(0, Math.PI * 2),
        weight: rand.range(0.45, 1),
        width: rand.range(0.28, 0.55),
      }));
      const size = rand.range(26, 40);
      return {
        profile(t) {
          return Math.pow(Math.max(0, 1 - t), steep) * (1 + 0.25 * Math.pow(1 - t, 4));
        },
        section(theta, t, y, r) {
          const c = Math.cos(theta);
          const s = Math.sin(theta);
          let lobe = 0;
          for (const k of ridges) {
            const d = angleDiff(theta, k.angle) / k.width;
            lobe += k.weight * Math.exp(-d * d);
          }
          const spurs = 0.62 + 0.62 * Math.min(1.3, lobe);
          const k = Math.pow(1 - t, 0.45);
          const lumps = surface(c, s, y, r, size, 1.2);
          return Math.max(0.3, (1 + (spurs - 1) * k) * (1 + lumps * 0.2));
        },
        ledges: [],
      };
    }
    case 'dome': {
      // Rounded, forested hills.
      const p = rand.range(1.6, 2.4);
      const size = rand.range(16, 26);
      return {
        profile(t) {
          return Math.pow(Math.max(0, 1 - Math.pow(t, p)), 0.55) * (1 + 0.3 * Math.pow(1 - t, 3));
        },
        section(theta, _t, y, r) {
          const c = Math.cos(theta);
          const s = Math.sin(theta);
          return Math.max(0.4, 1 + surface(c, s, y, r, size, 1) * 0.24);
        },
        ledges: [],
      };
    }
  }
}

/** Height fraction of ring `i` of `rings`: rings crowd towards the summit, where the outline turns. */
export function ringHeight(i: number, rings: number): number {
  return 1 - Math.pow(1 - i / rings, 1.35);
}

/** Point on the surface of a peak at angle theta and height fraction t. */
export function surfacePoint(
  spec: PeakSpec,
  shape: PeakShape,
  theta: number,
  t: number,
): { x: number; y: number; z: number } {
  const y = spec.base + t * spec.height;
  const drift = Math.pow(t, 1.6) * spec.lean * spec.height;
  const cx = spec.x + Math.cos(spec.leanAngle) * drift;
  const cz = spec.z + Math.sin(spec.leanAngle) * drift;
  const r0 = spec.radius * shape.profile(t);
  const r = r0 * shape.section(theta, t, y, r0);
  return { x: cx + Math.cos(theta) * r, y, z: cz + Math.sin(theta) * r };
}

/** Builds the mesh of one peak. */
export function buildPeak(spec: PeakSpec, res: Resolution): PeakMesh {
  const shape = makeShape(spec);
  const rand = new Random(spec.seed);
  const { around, rings } = res;
  const count = rings * around + 1;
  const positions = new Float32Array(count * 3);
  const info = new Float32Array(count * 3);
  const tint = rand.float();
  const veg = VEGETATION[spec.kind];
  const phase = rand.range(0, Math.PI * 2);
  for (let i = 0; i < rings; i++) {
    const t = ringHeight(i, rings);
    for (let j = 0; j < around; j++) {
      const theta = phase + (j / around) * Math.PI * 2;
      const p = surfacePoint(spec, shape, theta, t);
      const k = (i * around + j) * 3;
      positions[k] = p.x;
      positions[k + 1] = p.y;
      positions[k + 2] = p.z;
      info[k] = tint;
      info[k + 1] = t;
      info[k + 2] = veg;
    }
  }
  // the summit
  const top = surfacePoint(spec, shape, 0, 1);
  const k = (count - 1) * 3;
  positions[k] = top.x;
  positions[k + 1] = top.y;
  positions[k + 2] = top.z;
  info[k] = tint;
  info[k + 1] = 1;
  info[k + 2] = veg;

  // Quads between rings (wrapping around without a seam), then a fan to the summit.
  const indices = new Uint32Array((rings - 1) * around * 6 + around * 3);
  let o = 0;
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < around; j++) {
      const a = i * around + j;
      const b = i * around + ((j + 1) % around);
      const c = a + around;
      const d = b + around;
      // counter-clockwise seen from outside
      indices[o++] = a;
      indices[o++] = c;
      indices[o++] = b;
      indices[o++] = b;
      indices[o++] = c;
      indices[o++] = d;
    }
  }
  const last = (rings - 1) * around;
  for (let j = 0; j < around; j++) {
    indices[o++] = last + j;
    indices[o++] = count - 1;
    indices[o++] = last + ((j + 1) % around);
  }
  return { positions, info, indices };
}

/**
 * Spots for trees between height fractions t0 and t1: on the crown and the shoulders of a
 * peak, a little way out from the surface.
 */
export function perches(spec: PeakSpec, count: number, t0: number, t1: number, salt = 0): Perch[] {
  const shape = makeShape(spec);
  const rand = new Random(spec.seed * 13 + 5 + salt * 7717);
  const out: Perch[] = [];
  for (let n = 0; n < count; n++) {
    const theta = rand.range(0, Math.PI * 2);
    const t = rand.range(t0, t1);
    const p = surfacePoint(spec, shape, theta, t);
    // outward: from the drifted centre line through the point
    const drift = Math.pow(t, 1.6) * spec.lean * spec.height;
    const cx = spec.x + Math.cos(spec.leanAngle) * drift;
    const cz = spec.z + Math.sin(spec.leanAngle) * drift;
    let ox = p.x - cx;
    let oz = p.z - cz;
    const len = Math.hypot(ox, oz);
    if (len < 1e-3) {
      ox = Math.cos(theta);
      oz = Math.sin(theta);
    } else {
      ox /= len;
      oz /= len;
    }
    out.push({ ...p, ox, oz, t });
  }
  return out;
}

/** Height fractions of the ledges of a peak (where scrub collects). */
export function ledgesOf(spec: PeakSpec): number[] {
  return makeShape(spec).ledges;
}
