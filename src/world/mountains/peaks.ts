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
export const sj_VEGETATION: Record<PeakKind, number> = {
  karst: 0.95,
  spire: 0.55,
  massif: 0.7,
  dome: 1,
};

const sj_noise = new SimplexNoise(7340);

/** Shortest signed difference between two angles. */
function angleDiff(sj_a: number, sj_b: number): number {
  let sj_d = (sj_a - sj_b) % (Math.PI * 2);
  if (sj_d > Math.PI) sj_d -= Math.PI * 2;
  if (sj_d < -Math.PI) sj_d += Math.PI * 2;
  return sj_d;
}

/**
 * The shape of one peak: `profile(t)` is its silhouette (radius fraction at height fraction
 * t), `section(theta, t, y, r)` scales that radius around the peak.
 */
export interface PeakShape {
  profile(sj_t: number): number;
  section(sj_theta: number, sj_t: number, sj_y: number, sj_r: number): number;
  /** height fractions where the outline steps in, leaving a ledge */
  ledges: number[];
}

export function makeShape(sj_spec: PeakSpec): PeakShape {
  const sj_rand = new Random(sj_spec.seed * 7 + 3);
  const sj_ox = sj_rand.range(-500, 500);
  const sj_oy = sj_rand.range(-500, 500);
  const sj_oz = sj_rand.range(-500, 500);
  // 3D noise sampled on the surface itself (metres), so features keep a natural size
  // whatever the size of the peak and close up smoothly towards the summit.
  const sj_surface = (
    sj_c: number,
    sj_s: number,
    sj_y: number,
    sj_r: number,
    sj_size: number,
    sj_stretch: number,
  ) =>
    sj_noise.fbm3(
      (sj_c * sj_r) / sj_size + sj_ox,
      sj_y / (sj_size * sj_stretch) + sj_oy,
      (sj_s * sj_r) / sj_size + sj_oz,
      3,
    );

  // Ledges: the outline steps in at a few heights, like a stack of eroded blocks.
  const sj_ledges = Array.from({ length: sj_rand.int(1, 3) }, () => ({
    at: sj_rand.range(0.3, 0.8),
    depth: sj_rand.range(0.05, 0.12),
  }));
  const sj_stepped = (sj_t: number) => {
    let sj_k = 1;
    for (const sj_l of sj_ledges)
      sj_k -= sj_l.depth * smoothstep(sj_l.at - 0.015, sj_l.at + 0.015, sj_t);
    return sj_k;
  };
  const sj_ledgeHeights = sj_ledges.map((sj_l) => sj_l.at + 0.02);

  switch (sj_spec.kind) {
    case 'karst': {
      // Sheer sides, a rounded crown, a little scree at the foot; the upper part may bulge
      // a little, like the towers of Guilin. Some are pillars instead, with near-vertical
      // walls and a wooded, almost flat top, like those of Zhangjiajie.
      const sj_pillar = sj_rand.chance(0.4);
      const sj_p = sj_pillar ? sj_rand.range(7, 13) : sj_rand.range(2.8, 5.2);
      const sj_q = sj_pillar ? sj_rand.range(0.22, 0.32) : sj_rand.range(0.3, 0.5);
      const sj_flare = sj_rand.range(0.2, 0.55);
      const sj_bulge = sj_rand.range(0, 0.08);
      const sj_size = sj_rand.range(12, 19);
      return {
        profile(sj_t) {
          const sj_core = Math.pow(Math.max(0, 1 - Math.pow(sj_t, sj_p)), sj_q);
          const sj_foot = 1 + sj_flare * Math.pow(1 - sj_t, 6);
          const sj_belly = 1 + sj_bulge * Math.sin(Math.PI * smoothstep(0.35, 0.95, sj_t));
          return sj_core * sj_foot * sj_belly * sj_stepped(sj_t);
        },
        section(sj_theta, sj_t, sj_y, sj_r) {
          const sj_c = Math.cos(sj_theta);
          const sj_s = Math.sin(sj_theta);
          // big lumps, then vertical flutes cut by rain
          const sj_lumps = sj_surface(sj_c, sj_s, sj_y, sj_r, sj_size * 1.8, 1.8);
          const sj_flute = Math.abs(
            sj_noise.noise3(
              (sj_c * sj_r) / 6 + sj_oz,
              sj_y / 38 + sj_ox,
              (sj_s * sj_r) / 6 + sj_oy,
            ),
          );
          const sj_groove = 1 - smoothstep(0, 0.24, sj_flute);
          return Math.max(0.35, 1 + sj_lumps * 0.24 - sj_groove * 0.12 * (1 - sj_t * 0.6));
        },
        ledges: sj_ledgeHeights,
      };
    }
    case 'spire': {
      // A sandstone or granite pinnacle: columnar, then tapering to a broken point; deep
      // vertical joints split it into pillars.
      const sj_p = sj_rand.range(1.6, 2.6);
      const sj_q = sj_rand.range(0.6, 0.85);
      const sj_taper = sj_rand.range(0.2, 0.4);
      const sj_size = sj_rand.range(7, 11);
      // whole number, so the pattern closes up around the spire without a seam
      const sj_joints = sj_rand.int(3, 5);
      // the tip is broken off rather than sharp
      const sj_cut = sj_rand.range(0.93, 0.98);
      return {
        profile(sj_t) {
          const sj_tt = Math.min(sj_t, sj_cut);
          const sj_core =
            Math.pow(Math.max(0, 1 - Math.pow(sj_tt, sj_p)), sj_q) * (1 - sj_taper * sj_tt);
          return sj_t >= 1 ? 0 : sj_core * (1 + 0.45 * Math.pow(1 - sj_t, 7)) * sj_stepped(sj_t);
        },
        section(sj_theta, sj_t, sj_y, sj_r) {
          const sj_c = Math.cos(sj_theta);
          const sj_s = Math.sin(sj_theta);
          const sj_lumps = sj_surface(sj_c, sj_s, sj_y, sj_r, sj_size * 1.6, 2.2);
          // pillars: a ridged pattern around the spire that wanders with height
          const sj_wander = sj_noise.noise2(sj_y / 40 + sj_ox, sj_oz) * 0.9;
          const sj_pillar = Math.abs(Math.sin(sj_theta * sj_joints + sj_wander));
          const sj_joint = 1 - smoothstep(0, 0.3, sj_pillar);
          return Math.max(0.3, 1 + sj_lumps * 0.3 - sj_joint * 0.16 * (1 - sj_t * 0.4));
        },
        ledges: sj_ledgeHeights,
      };
    }
    case 'massif': {
      // A big mountain with a sharp summit and three to five ridges (aretes) running
      // down into spurs.
      const sj_steep = sj_rand.range(1.05, 1.4);
      const sj_ridges = Array.from({ length: sj_rand.int(3, 5) }, () => ({
        angle: sj_rand.range(0, Math.PI * 2),
        weight: sj_rand.range(0.45, 1),
        width: sj_rand.range(0.28, 0.55),
      }));
      const sj_size = sj_rand.range(26, 40);
      return {
        profile(sj_t) {
          return Math.pow(Math.max(0, 1 - sj_t), sj_steep) * (1 + 0.25 * Math.pow(1 - sj_t, 4));
        },
        section(sj_theta, sj_t, sj_y, sj_r) {
          const sj_c = Math.cos(sj_theta);
          const sj_s = Math.sin(sj_theta);
          let sj_lobe = 0;
          for (const sj_k of sj_ridges) {
            const sj_d = angleDiff(sj_theta, sj_k.angle) / sj_k.width;
            sj_lobe += sj_k.weight * Math.exp(-sj_d * sj_d);
          }
          const sj_spurs = 0.62 + 0.62 * Math.min(1.3, sj_lobe);
          const sj_k = Math.pow(1 - sj_t, 0.45);
          const sj_lumps = sj_surface(sj_c, sj_s, sj_y, sj_r, sj_size, 1.2);
          return Math.max(0.3, (1 + (sj_spurs - 1) * sj_k) * (1 + sj_lumps * 0.2));
        },
        ledges: [],
      };
    }
    case 'dome': {
      // Rounded, forested hills.
      const sj_p = sj_rand.range(1.6, 2.4);
      const sj_size = sj_rand.range(16, 26);
      return {
        profile(sj_t) {
          return (
            Math.pow(Math.max(0, 1 - Math.pow(sj_t, sj_p)), 0.55) *
            (1 + 0.3 * Math.pow(1 - sj_t, 3))
          );
        },
        section(sj_theta, _sj_t, sj_y, sj_r) {
          const sj_c = Math.cos(sj_theta);
          const sj_s = Math.sin(sj_theta);
          return Math.max(0.4, 1 + sj_surface(sj_c, sj_s, sj_y, sj_r, sj_size, 1) * 0.24);
        },
        ledges: [],
      };
    }
  }
}

/** Height fraction of ring `sj_i` of `rings`: rings crowd towards the summit, where the outline turns. */
export function ringHeight(sj_i: number, sj_rings: number): number {
  return 1 - Math.pow(1 - sj_i / sj_rings, 1.35);
}

/** Point on the surface of a peak at angle theta and height fraction t. */
export function surfacePoint(
  sj_spec: PeakSpec,
  sj_shape: PeakShape,
  sj_theta: number,
  sj_t: number,
): { x: number; y: number; z: number } {
  const sj_y = sj_spec.base + sj_t * sj_spec.height;
  const sj_drift = Math.pow(sj_t, 1.6) * sj_spec.lean * sj_spec.height;
  const sj_cx = sj_spec.x + Math.cos(sj_spec.leanAngle) * sj_drift;
  const sj_cz = sj_spec.z + Math.sin(sj_spec.leanAngle) * sj_drift;
  const sj_r0 = sj_spec.radius * sj_shape.profile(sj_t);
  const sj_r = sj_r0 * sj_shape.section(sj_theta, sj_t, sj_y, sj_r0);
  return { x: sj_cx + Math.cos(sj_theta) * sj_r, y: sj_y, z: sj_cz + Math.sin(sj_theta) * sj_r };
}

/** Builds the mesh of one peak. */
export function buildPeak(sj_spec: PeakSpec, sj_res: Resolution): PeakMesh {
  const sj_shape = makeShape(sj_spec);
  const sj_rand = new Random(sj_spec.seed);
  const { around: sj_around, rings: sj_rings } = sj_res;
  const sj_count = sj_rings * sj_around + 1;
  const sj_positions = new Float32Array(sj_count * 3);
  const sj_info = new Float32Array(sj_count * 3);
  const sj_tint = sj_rand.float();
  const sj_veg = sj_VEGETATION[sj_spec.kind];
  const sj_phase = sj_rand.range(0, Math.PI * 2);
  for (let sj_i = 0; sj_i < sj_rings; sj_i++) {
    const sj_t = ringHeight(sj_i, sj_rings);
    for (let sj_j = 0; sj_j < sj_around; sj_j++) {
      const sj_theta = sj_phase + (sj_j / sj_around) * Math.PI * 2;
      const sj_p = surfacePoint(sj_spec, sj_shape, sj_theta, sj_t);
      const sj_k = (sj_i * sj_around + sj_j) * 3;
      sj_positions[sj_k] = sj_p.x;
      sj_positions[sj_k + 1] = sj_p.y;
      sj_positions[sj_k + 2] = sj_p.z;
      sj_info[sj_k] = sj_tint;
      sj_info[sj_k + 1] = sj_t;
      sj_info[sj_k + 2] = sj_veg;
    }
  }
  // the summit
  const sj_top = surfacePoint(sj_spec, sj_shape, 0, 1);
  const sj_k = (sj_count - 1) * 3;
  sj_positions[sj_k] = sj_top.x;
  sj_positions[sj_k + 1] = sj_top.y;
  sj_positions[sj_k + 2] = sj_top.z;
  sj_info[sj_k] = sj_tint;
  sj_info[sj_k + 1] = 1;
  sj_info[sj_k + 2] = sj_veg;

  // Quads between rings (wrapping around without a seam), then a fan to the summit.
  const sj_indices = new Uint32Array((sj_rings - 1) * sj_around * 6 + sj_around * 3);
  let sj_o = 0;
  for (let sj_i = 0; sj_i < sj_rings - 1; sj_i++) {
    for (let sj_j = 0; sj_j < sj_around; sj_j++) {
      const sj_a = sj_i * sj_around + sj_j;
      const sj_b = sj_i * sj_around + ((sj_j + 1) % sj_around);
      const sj_c = sj_a + sj_around;
      const sj_d = sj_b + sj_around;
      // counter-clockwise seen from outside
      sj_indices[sj_o++] = sj_a;
      sj_indices[sj_o++] = sj_c;
      sj_indices[sj_o++] = sj_b;
      sj_indices[sj_o++] = sj_b;
      sj_indices[sj_o++] = sj_c;
      sj_indices[sj_o++] = sj_d;
    }
  }
  const sj_last = (sj_rings - 1) * sj_around;
  for (let sj_j = 0; sj_j < sj_around; sj_j++) {
    sj_indices[sj_o++] = sj_last + sj_j;
    sj_indices[sj_o++] = sj_count - 1;
    sj_indices[sj_o++] = sj_last + ((sj_j + 1) % sj_around);
  }
  return { positions: sj_positions, info: sj_info, indices: sj_indices };
}

/**
 * Spots for trees between height fractions t0 and t1: on the crown and the shoulders of a
 * peak, a little way out from the surface.
 */
export function perches(
  sj_spec: PeakSpec,
  sj_count: number,
  sj_t0: number,
  sj_t1: number,
  sj_salt = 0,
): Perch[] {
  const sj_shape = makeShape(sj_spec);
  const sj_rand = new Random(sj_spec.seed * 13 + 5 + sj_salt * 7717);
  const sj_out: Perch[] = [];
  for (let sj_n = 0; sj_n < sj_count; sj_n++) {
    const sj_theta = sj_rand.range(0, Math.PI * 2);
    const sj_t = sj_rand.range(sj_t0, sj_t1);
    const sj_p = surfacePoint(sj_spec, sj_shape, sj_theta, sj_t);
    // outward: from the drifted centre line through the point
    const sj_drift = Math.pow(sj_t, 1.6) * sj_spec.lean * sj_spec.height;
    const sj_cx = sj_spec.x + Math.cos(sj_spec.leanAngle) * sj_drift;
    const sj_cz = sj_spec.z + Math.sin(sj_spec.leanAngle) * sj_drift;
    let sj_ox = sj_p.x - sj_cx;
    let sj_oz = sj_p.z - sj_cz;
    const sj_len = Math.hypot(sj_ox, sj_oz);
    if (sj_len < 1e-3) {
      sj_ox = Math.cos(sj_theta);
      sj_oz = Math.sin(sj_theta);
    } else {
      sj_ox /= sj_len;
      sj_oz /= sj_len;
    }
    sj_out.push({ ...sj_p, ox: sj_ox, oz: sj_oz, t: sj_t });
  }
  return sj_out;
}

/** Height fractions of the ledges of a peak (where scrub collects). */
export function ledgesOf(sj_spec: PeakSpec): number[] {
  return makeShape(sj_spec).ledges;
}
