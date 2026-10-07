import { BufferAttribute, BufferGeometry, Color, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Random } from '../../utils/random';

export type TreeKind = 'blossom' | 'broadleaf' | 'pine' | 'willow';

export interface TreeModel {
  trunk: BufferGeometry;
  canopy: BufferGeometry;
  /** willow only: hanging strands (drawn with the strand texture) */
  strands?: BufferGeometry;
  height: number;
  trunkRadius: number;
  /** horizontal radius of the crown (for shade and spacing) */
  crownRadius: number;
  /** blossom blobs (world-local), used to spawn falling petals */
  blobs: { center: Vector3; radius: number }[];
}

interface Branch {
  points: Vector3[];
  radii: number[];
}

interface Blob {
  center: Vector3;
  radius: number;
  squash: number;
}

const sj_UP = new Vector3(0, 1, 0);
const sj_tmpA = new Vector3();
const sj_tmpB = new Vector3();
const sj_tmpQ = new Quaternion();

/** Tapered tube along a polyline with vertex colours and a wind height factor. */
function tube(
  sj_b: Branch,
  sj_radial: number,
  sj_treeHeight: number,
  sj_bark: Color,
  sj_barkDark: Color,
  sj_rand: Random,
): BufferGeometry {
  const sj_rings = sj_b.points.length;
  const sj_pos: number[] = [];
  const sj_nrm: number[] = [];
  const sj_col: number[] = [];
  const sj_wind: number[] = [];
  const sj_idx: number[] = [];
  let sj_prevSide = new Vector3(1, 0, 0);
  const sj_c = new Color();
  for (let sj_i = 0; sj_i < sj_rings; sj_i++) {
    const sj_p = sj_b.points[sj_i]!;
    const sj_dir = sj_tmpA
      .subVectors(
        sj_b.points[Math.min(sj_i + 1, sj_rings - 1)]!,
        sj_b.points[Math.max(sj_i - 1, 0)]!,
      )
      .normalize();
    // Parallel-transport-ish frame: keep the side vector close to the previous one.
    const sj_side = sj_prevSide.clone().addScaledVector(sj_dir, -sj_prevSide.dot(sj_dir));
    if (sj_side.lengthSq() < 1e-6) sj_side.set(0, 0, 1).addScaledVector(sj_dir, -sj_dir.z);
    sj_side.normalize();
    sj_prevSide = sj_side;
    const sj_up = new Vector3().crossVectors(sj_dir, sj_side).normalize();
    const sj_r = sj_b.radii[sj_i]!;
    for (let sj_k = 0; sj_k < sj_radial; sj_k++) {
      const sj_a = (sj_k / sj_radial) * Math.PI * 2;
      const sj_n = sj_tmpB
        .copy(sj_side)
        .multiplyScalar(Math.cos(sj_a))
        .addScaledVector(sj_up, Math.sin(sj_a));
      const sj_bump = 1 + (sj_rand.float() - 0.5) * 0.12;
      sj_pos.push(
        sj_p.x + sj_n.x * sj_r * sj_bump,
        sj_p.y + sj_n.y * sj_r * sj_bump,
        sj_p.z + sj_n.z * sj_r * sj_bump,
      );
      sj_nrm.push(sj_n.x, sj_n.y, sj_n.z);
      // bark: darker in grooves (alternating), lighter higher up
      sj_c
        .copy(sj_barkDark)
        .lerp(
          sj_bark,
          0.55 + 0.45 * Math.sin(sj_a * 3 + sj_i * 1.3) * 0.5 + sj_rand.float() * 0.25,
        );
      sj_col.push(sj_c.r, sj_c.g, sj_c.b);
      sj_wind.push(Math.min(1, Math.max(0, sj_p.y / sj_treeHeight)) * 0.8, 0);
    }
  }
  for (let sj_i = 0; sj_i < sj_rings - 1; sj_i++) {
    for (let sj_k = 0; sj_k < sj_radial; sj_k++) {
      const sj_a = sj_i * sj_radial + sj_k;
      const sj_b2 = sj_i * sj_radial + ((sj_k + 1) % sj_radial);
      const sj_c2 = (sj_i + 1) * sj_radial + sj_k;
      const sj_d = (sj_i + 1) * sj_radial + ((sj_k + 1) % sj_radial);
      sj_idx.push(sj_a, sj_c2, sj_b2, sj_b2, sj_c2, sj_d);
    }
  }
  const sj_g = new BufferGeometry();
  sj_g.setAttribute('position', new BufferAttribute(new Float32Array(sj_pos), 3));
  sj_g.setAttribute('normal', new BufferAttribute(new Float32Array(sj_nrm), 3));
  sj_g.setAttribute('color', new BufferAttribute(new Float32Array(sj_col), 3));
  sj_g.setAttribute('aWind', new BufferAttribute(new Float32Array(sj_wind), 2));
  sj_g.setIndex(sj_idx);
  return sj_g;
}

/** A curved branch from `sj_start` heading along `sj_dir`, bending towards `sj_bendTo`. */
function makeBranch(
  sj_rand: Random,
  sj_start: Vector3,
  sj_dir: Vector3,
  sj_length: number,
  sj_r0: number,
  sj_r1: number,
  sj_segments: number,
  sj_bendTo: Vector3,
  sj_wobble: number,
): Branch {
  const sj_points: Vector3[] = [sj_start.clone()];
  const sj_radii: number[] = [sj_r0];
  const sj_d = sj_dir.clone().normalize();
  const sj_p = sj_start.clone();
  for (let sj_i = 1; sj_i <= sj_segments; sj_i++) {
    const sj_t = sj_i / sj_segments;
    sj_d.lerp(sj_bendTo, 0.18).normalize();
    sj_d.x += sj_rand.spread(sj_wobble);
    sj_d.z += sj_rand.spread(sj_wobble);
    sj_d.y += sj_rand.spread(sj_wobble * 0.5);
    sj_d.normalize();
    sj_p.addScaledVector(sj_d, sj_length / sj_segments);
    sj_points.push(sj_p.clone());
    sj_radii.push(sj_r0 + (sj_r1 - sj_r0) * Math.pow(sj_t, 0.8));
  }
  return { points: sj_points, radii: sj_radii };
}

function randomDirection(_sj_rand: Random, sj_azimuth: number, sj_elevation: number): Vector3 {
  const sj_ce = Math.cos(sj_elevation);
  return new Vector3(
    Math.cos(sj_azimuth) * sj_ce,
    Math.sin(sj_elevation),
    Math.sin(sj_azimuth) * sj_ce,
  );
}

/** Alpha-tested cards scattered through canopy blobs, lit with spherical normals. */
function canopyCards(
  sj_blobs: Blob[],
  sj_rand: Random,
  sj_treeHeight: number,
  sj_tint: Color,
  sj_tintVariance: number,
  sj_cardScale: number,
  sj_density: number,
): BufferGeometry {
  const sj_pos: number[] = [];
  const sj_nrm: number[] = [];
  const sj_uv: number[] = [];
  const sj_col: number[] = [];
  const sj_wind: number[] = [];
  const sj_idx: number[] = [];
  const sj_c = new Color();
  const sj_axis = new Vector3();
  const sj_u = new Vector3();
  const sj_v = new Vector3();
  let sj_vi = 0;
  for (const sj_blob of sj_blobs) {
    const sj_count = Math.round(
      Math.min(46, Math.max(9, 17 * (sj_blob.radius / 1.2) ** 2)) * sj_density,
    );
    for (let sj_i = 0; sj_i < sj_count; sj_i++) {
      // point biased towards the surface of the (squashed) sphere
      const sj_dir = new Vector3(sj_rand.spread(1), sj_rand.spread(1), sj_rand.spread(1));
      if (sj_dir.lengthSq() < 1e-4) sj_dir.set(0, 1, 0);
      sj_dir.normalize();
      const sj_rr = sj_blob.radius * Math.pow(sj_rand.float(), 0.35) * 0.82;
      const sj_center = sj_blob.center
        .clone()
        .add(new Vector3(sj_dir.x * sj_rr, sj_dir.y * sj_rr * sj_blob.squash, sj_dir.z * sj_rr));
      const sj_size = sj_blob.radius * sj_cardScale * sj_rand.range(0.75, 1.15);
      sj_axis.set(sj_rand.spread(1), sj_rand.spread(1), sj_rand.spread(1)).normalize();
      sj_tmpQ.setFromAxisAngle(sj_axis, sj_rand.range(0, Math.PI));
      sj_u
        .set(1, 0, 0)
        .applyQuaternion(sj_tmpQ)
        .multiplyScalar(sj_size * 0.5);
      sj_v
        .set(0, 1, 0)
        .applyQuaternion(sj_tmpQ)
        .multiplyScalar(sj_size * 0.5);
      const sj_depth = sj_rr / sj_blob.radius; // 0 = core, 1 = surface
      const sj_heightF = Math.min(1, Math.max(0, sj_center.y / sj_treeHeight));
      const sj_ao = 0.5 + 0.5 * sj_depth * (0.75 + 0.25 * sj_heightF);
      sj_c.copy(sj_tint).multiplyScalar((1 + sj_rand.spread(sj_tintVariance)) * sj_ao);
      const sj_corners: [number, number][] = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ];
      const sj_rot = sj_rand.int(0, 3);
      sj_corners.forEach(([sj_a, sj_b], sj_k) => {
        const sj_px = sj_center.x + sj_u.x * sj_a + sj_v.x * sj_b;
        const sj_py = sj_center.y + sj_u.y * sj_a + sj_v.y * sj_b;
        const sj_pz = sj_center.z + sj_u.z * sj_a + sj_v.z * sj_b;
        sj_pos.push(sj_px, sj_py, sj_pz);
        // spherical normal from the blob centre, nudged upwards (sky light)
        const sj_n = sj_tmpA
          .set(
            sj_px - sj_blob.center.x,
            (sj_py - sj_blob.center.y) / sj_blob.squash,
            sj_pz - sj_blob.center.z,
          )
          .normalize()
          .lerp(sj_UP, 0.25)
          .normalize();
        sj_nrm.push(sj_n.x, sj_n.y, sj_n.z);
        const [sj_uu, sj_vv] = sj_corners[(sj_k + sj_rot) % 4]!;
        sj_uv.push((sj_uu + 1) / 2, (sj_vv + 1) / 2);
        sj_col.push(sj_c.r, sj_c.g, sj_c.b);
        sj_wind.push(Math.min(1.2, sj_py / sj_treeHeight), 1);
      });
      sj_idx.push(sj_vi, sj_vi + 1, sj_vi + 2, sj_vi, sj_vi + 2, sj_vi + 3);
      sj_vi += 4;
    }
  }
  const sj_g = new BufferGeometry();
  sj_g.setAttribute('position', new BufferAttribute(new Float32Array(sj_pos), 3));
  sj_g.setAttribute('normal', new BufferAttribute(new Float32Array(sj_nrm), 3));
  sj_g.setAttribute('uv', new BufferAttribute(new Float32Array(sj_uv), 2));
  sj_g.setAttribute('color', new BufferAttribute(new Float32Array(sj_col), 3));
  sj_g.setAttribute('aWind', new BufferAttribute(new Float32Array(sj_wind), 2));
  sj_g.setIndex(sj_idx);
  return sj_g;
}

/** A point on an arching willow branch where a strand hangs from. */
interface StrandAnchor {
  at: Vector3;
  /** horizontal direction away from the trunk */
  out: Vector3;
}

/**
 * The willow's curtain: long ribbons of leafy strands that leave the arching branches,
 * carry on outwards a little and fall almost to the ground. Each ribbon is a few
 * segments long, so it curves; normals point away from the crown, so the curtain is lit
 * like one soft mass; the tips sway the most.
 */
function willowCurtain(
  sj_anchors: StrandAnchor[],
  sj_rand: Random,
  sj_crown: Vector3,
  sj_tint: Color,
): BufferGeometry {
  const sj_pos: number[] = [];
  const sj_nrm: number[] = [];
  const sj_uv: number[] = [];
  const sj_col: number[] = [];
  const sj_wind: number[] = [];
  const sj_idx: number[] = [];
  const sj_c = new Color();
  const sj_segs = 5;
  let sj_vi = 0;
  for (const sj_a of sj_anchors) {
    // ragged ends: some strands sweep the ground, others stop well short
    const sj_floor = 0.15 + Math.pow(sj_rand.float(), 1.6) * 1.9;
    const sj_len = Math.max(0.6, sj_a.at.y - sj_floor);
    const sj_reach = sj_rand.range(0.15, 0.5);
    const sj_width = sj_rand.range(0.45, 0.65);
    // mostly facing outwards, turned a little either way
    const sj_side = new Vector3(-sj_a.out.z, 0, sj_a.out.x).applyAxisAngle(
      sj_UP,
      sj_rand.spread(0.7),
    );
    sj_c.copy(sj_tint).multiplyScalar(1 + sj_rand.spread(0.14));
    for (let sj_k = 0; sj_k <= sj_segs; sj_k++) {
      const sj_s = sj_k / sj_segs;
      const sj_p = sj_a.at
        .clone()
        .addScaledVector(sj_a.out, sj_reach * (1 - (1 - sj_s) * (1 - sj_s)))
        .add(new Vector3(0, -sj_len * Math.pow(sj_s, 1.12), 0));
      // lit as part of one mass: away from the middle of the crown, a little upwards
      const sj_n = sj_tmpA
        .set(sj_p.x - sj_crown.x, (sj_p.y - sj_crown.y) * 0.5, sj_p.z - sj_crown.z)
        .normalize()
        .lerp(sj_UP, 0.2)
        .normalize();
      const sj_shade = 1 - sj_s * 0.22;
      for (const sj_w of [-0.5, 0.5]) {
        const sj_taper = 1 - sj_s * 0.35;
        const sj_q = sj_p.clone().addScaledVector(sj_side, sj_w * sj_width * sj_taper);
        sj_pos.push(sj_q.x, sj_q.y, sj_q.z);
        sj_nrm.push(sj_n.x, sj_n.y, sj_n.z);
        sj_uv.push(sj_w + 0.5, 1 - sj_s);
        sj_col.push(sj_c.r * sj_shade, sj_c.g * sj_shade, sj_c.b * sj_shade);
        sj_wind.push(0.55 + sj_s * 0.75, 0.25 + sj_s * 0.75);
      }
      if (sj_k < sj_segs) sj_idx.push(sj_vi, sj_vi + 1, sj_vi + 2, sj_vi + 1, sj_vi + 3, sj_vi + 2);
      sj_vi += 2;
    }
  }
  const sj_g = new BufferGeometry();
  sj_g.setAttribute('position', new BufferAttribute(new Float32Array(sj_pos), 3));
  sj_g.setAttribute('normal', new BufferAttribute(new Float32Array(sj_nrm), 3));
  sj_g.setAttribute('uv', new BufferAttribute(new Float32Array(sj_uv), 2));
  sj_g.setAttribute('color', new BufferAttribute(new Float32Array(sj_col), 3));
  sj_g.setAttribute('aWind', new BufferAttribute(new Float32Array(sj_wind), 2));
  sj_g.setIndex(sj_idx);
  return sj_g;
}

export interface TreeOptions {
  kind: TreeKind;
  seed: number;
  /** multiplies the default number of canopy cards (quality) */
  density?: number;
}

/** Grows one tree variant. Coordinates are local with the trunk base at the origin. */
export function growTree({
  kind: sj_kind,
  seed: sj_seed,
  density: sj_density = 1,
}: TreeOptions): TreeModel {
  const sj_rand = new Random(sj_seed);
  const sj_branches: Branch[] = [];
  const sj_blobs: Blob[] = [];
  let sj_height = 6;
  let sj_trunkRadius: number;
  const sj_bark = new Color('#6b4a36');
  const sj_barkDark = new Color('#3e2a20');
  let sj_tint = new Color('#ffffff');
  let sj_cardScale: number;
  let sj_tintVariance = 0.12;
  const sj_willowAnchors: StrandAnchor[] = [];
  const sj_willowCrown = new Vector3();

  if (sj_kind === 'blossom') {
    sj_bark.set('#5a3d2e');
    sj_barkDark.set('#2f1f18');
    const sj_trunkH = sj_rand.range(1.8, 2.6);
    sj_trunkRadius = sj_rand.range(0.2, 0.28);
    const sj_lean = randomDirection(sj_rand, sj_rand.range(0, 6.28), 1.25);
    const sj_trunk = makeBranch(
      sj_rand,
      new Vector3(),
      sj_lean,
      sj_trunkH,
      sj_trunkRadius,
      sj_trunkRadius * 0.7,
      4,
      sj_UP,
      0.12,
    );
    sj_branches.push(sj_trunk);
    const sj_top = sj_trunk.points[sj_trunk.points.length - 1]!;
    const sj_mains = sj_rand.int(4, 5);
    const sj_az0 = sj_rand.range(0, 6.28);
    for (let sj_i = 0; sj_i < sj_mains; sj_i++) {
      const sj_az = sj_az0 + (sj_i / sj_mains) * Math.PI * 2 + sj_rand.spread(0.4);
      const sj_dir = randomDirection(sj_rand, sj_az, sj_rand.range(0.45, 0.85));
      const sj_len = sj_rand.range(1.8, 2.6);
      const sj_main = makeBranch(
        sj_rand,
        sj_top,
        sj_dir,
        sj_len,
        sj_trunkRadius * 0.62,
        0.07,
        3,
        randomDirection(sj_rand, sj_az, 0.25),
        0.12,
      );
      sj_branches.push(sj_main);
      const sj_end = sj_main.points[sj_main.points.length - 1]!;
      const sj_subs = sj_rand.int(2, 3);
      for (let sj_s = 0; sj_s < sj_subs; sj_s++) {
        const sj_sdir = randomDirection(
          sj_rand,
          sj_az + sj_rand.spread(0.9),
          sj_rand.range(0.2, 0.9),
        );
        const sj_sub = makeBranch(
          sj_rand,
          sj_main.points[2]!,
          sj_sdir,
          sj_rand.range(0.9, 1.5),
          0.07,
          0.025,
          2,
          sj_UP,
          0.15,
        );
        sj_branches.push(sj_sub);
        const sj_se = sj_sub.points[sj_sub.points.length - 1]!;
        sj_blobs.push({ center: sj_se.clone(), radius: sj_rand.range(0.9, 1.25), squash: 0.72 });
      }
      sj_blobs.push({
        center: sj_end.clone().add(new Vector3(0, 0.2, 0)),
        radius: sj_rand.range(1.2, 1.55),
        squash: 0.7,
      });
    }
    sj_blobs.push({ center: sj_top.clone().add(new Vector3(0, 1.3, 0)), radius: 1.5, squash: 0.7 });
    sj_height = Math.max(...sj_blobs.map((sj_b) => sj_b.center.y + sj_b.radius * sj_b.squash));
    sj_cardScale = 1.05;
    sj_tintVariance = 0.08;
  } else if (sj_kind === 'broadleaf') {
    sj_bark.set('#6a5140');
    const sj_trunkH = sj_rand.range(2.4, 3.4);
    sj_trunkRadius = sj_rand.range(0.22, 0.3);
    const sj_trunk = makeBranch(
      sj_rand,
      new Vector3(),
      randomDirection(sj_rand, sj_rand.range(0, 6.28), 1.4),
      sj_trunkH,
      sj_trunkRadius,
      sj_trunkRadius * 0.65,
      4,
      sj_UP,
      0.06,
    );
    sj_branches.push(sj_trunk);
    const sj_top = sj_trunk.points[sj_trunk.points.length - 1]!;
    const sj_mains = sj_rand.int(3, 5);
    for (let sj_i = 0; sj_i < sj_mains; sj_i++) {
      const sj_az = (sj_i / sj_mains) * Math.PI * 2 + sj_rand.spread(0.5);
      const sj_dir = randomDirection(sj_rand, sj_az, sj_rand.range(0.7, 1.1));
      const sj_main = makeBranch(
        sj_rand,
        sj_top,
        sj_dir,
        sj_rand.range(1.5, 2.4),
        sj_trunkRadius * 0.55,
        0.06,
        3,
        sj_UP,
        0.1,
      );
      sj_branches.push(sj_main);
      const sj_end = sj_main.points[sj_main.points.length - 1]!;
      sj_blobs.push({ center: sj_end.clone(), radius: sj_rand.range(1.5, 2.1), squash: 0.85 });
    }
    sj_blobs.push({ center: sj_top.clone().add(new Vector3(0, 2.2, 0)), radius: 2, squash: 0.85 });
    sj_height = Math.max(...sj_blobs.map((sj_b) => sj_b.center.y + sj_b.radius * sj_b.squash));
    sj_tint = new Color('#ffffff');
    sj_cardScale = 1.15;
  } else if (sj_kind === 'pine') {
    sj_bark.set('#5e4a3c');
    sj_barkDark.set('#352a22');
    const sj_trunkH = sj_rand.range(5, 7.5);
    sj_trunkRadius = sj_rand.range(0.22, 0.32);
    const sj_lean = randomDirection(sj_rand, sj_rand.range(0, 6.28), sj_rand.range(1.15, 1.35));
    const sj_trunk = makeBranch(
      sj_rand,
      new Vector3(),
      sj_lean,
      sj_trunkH,
      sj_trunkRadius,
      0.08,
      6,
      sj_UP,
      0.14,
    );
    sj_branches.push(sj_trunk);
    // Layered horizontal "cloud" pads, like the pines on painted mountains.
    const sj_tiers = sj_rand.int(3, 5);
    for (let sj_i = 0; sj_i < sj_tiers; sj_i++) {
      const sj_t = 0.45 + (sj_i / sj_tiers) * 0.55;
      const sj_idx = Math.min(
        sj_trunk.points.length - 1,
        Math.round(sj_t * (sj_trunk.points.length - 1)),
      );
      const sj_at = sj_trunk.points[sj_idx]!;
      const sj_az = sj_rand.range(0, 6.28);
      const sj_len = (1 - sj_t) * sj_rand.range(2.2, 3.2) + 0.6;
      const sj_dir = randomDirection(sj_rand, sj_az, sj_rand.range(-0.05, 0.2));
      const sj_b = makeBranch(
        sj_rand,
        sj_at,
        sj_dir,
        sj_len,
        0.1,
        0.03,
        3,
        sj_dir.clone().setY(0.1),
        0.1,
      );
      sj_branches.push(sj_b);
      const sj_end = sj_b.points[sj_b.points.length - 1]!;
      sj_blobs.push({
        center: sj_end.clone().add(new Vector3(0, 0.15, 0)),
        radius: sj_rand.range(1.1, 1.6) * (1.1 - sj_t * 0.3),
        squash: 0.38,
      });
    }
    const sj_top = sj_trunk.points[sj_trunk.points.length - 1]!;
    sj_blobs.push({
      center: sj_top.clone().add(new Vector3(0, 0.2, 0)),
      radius: 1.3,
      squash: 0.42,
    });
    sj_height = Math.max(...sj_blobs.map((sj_b) => sj_b.center.y + sj_b.radius * sj_b.squash));
    sj_cardScale = 1.25;
  } else {
    // Willow: a short, stout trunk splits into a few limbs that rise and spread like a
    // vase; at their ends, branches arch over and down, and the curtain hangs from them.
    sj_bark.set('#5a4636');
    sj_barkDark.set('#352920');
    const sj_trunkH = sj_rand.range(1.5, 2.1);
    sj_trunkRadius = sj_rand.range(0.3, 0.38);
    const sj_trunk = makeBranch(
      sj_rand,
      new Vector3(),
      randomDirection(sj_rand, sj_rand.range(0, 6.28), 1.36),
      sj_trunkH,
      sj_trunkRadius,
      sj_trunkRadius * 0.78,
      4,
      sj_UP,
      0.08,
    );
    sj_branches.push(sj_trunk);
    const sj_top = sj_trunk.points[sj_trunk.points.length - 1]!;
    const sj_limbs = sj_rand.int(3, 4);
    const sj_az0 = sj_rand.range(0, 6.28);
    let sj_topY = sj_top.y;
    for (let sj_i = 0; sj_i < sj_limbs; sj_i++) {
      const sj_az = sj_az0 + (sj_i / sj_limbs) * Math.PI * 2 + sj_rand.spread(0.35);
      const sj_limb = makeBranch(
        sj_rand,
        sj_top,
        randomDirection(sj_rand, sj_az, sj_rand.range(1.0, 1.22)),
        sj_rand.range(1.6, 2.2),
        sj_trunkRadius * 0.62,
        sj_trunkRadius * 0.32,
        4,
        randomDirection(sj_rand, sj_az, 1.0),
        0.06,
      );
      sj_branches.push(sj_limb);
      const sj_end = sj_limb.points[sj_limb.points.length - 1]!;
      sj_topY = Math.max(sj_topY, sj_end.y);
      sj_blobs.push({
        center: sj_end.clone().add(new Vector3(0, 0.35, 0)),
        radius: sj_rand.range(1.25, 1.55),
        squash: 0.62,
      });
      // arching branches fanning out over the top and bending down
      const sj_arches = sj_rand.int(4, 5);
      for (let sj_k = 0; sj_k < sj_arches; sj_k++) {
        const sj_taz = sj_az + ((sj_k + 0.5) / sj_arches - 0.5) * 2.2 + sj_rand.spread(0.25);
        const sj_arch = makeBranch(
          sj_rand,
          sj_limb.points[sj_limb.points.length - 1 - (sj_k % 2)]!,
          randomDirection(sj_rand, sj_taz, sj_rand.range(0.7, 1.0)),
          sj_rand.range(1.8, 2.5),
          0.07,
          0.02,
          6,
          randomDirection(sj_rand, sj_taz, -1.3),
          0.04,
        );
        sj_branches.push(sj_arch);
        for (let sj_j = 1; sj_j < sj_arch.points.length; sj_j++) {
          const sj_at = sj_arch.points[sj_j]!;
          sj_topY = Math.max(sj_topY, sj_at.y);
          const sj_out = new Vector3(sj_at.x, 0, sj_at.z);
          if (sj_out.lengthSq() < 1e-4) sj_out.set(Math.cos(sj_taz), 0, Math.sin(sj_taz));
          sj_out.normalize();
          const sj_n = Math.max(1, Math.round(sj_rand.int(3, 5) * sj_density));
          for (let sj_m = 0; sj_m < sj_n; sj_m++) {
            sj_willowAnchors.push({
              at: sj_at
                .clone()
                .add(
                  new Vector3(
                    sj_rand.spread(0.35),
                    sj_rand.range(-0.1, 0.12),
                    sj_rand.spread(0.35),
                  ),
                ),
              out: sj_out,
            });
          }
        }
      }
    }
    sj_willowCrown.set(0, sj_topY - 1.2, 0);
    sj_height = sj_topY + 0.6;
    sj_cardScale = 1.05;
  }

  const sj_trunkParts = sj_branches.map((sj_b, sj_i) =>
    tube(
      sj_b,
      sj_i === 0 ? 9 : sj_b.radii[0]! > 0.1 ? 6 : 4,
      sj_height,
      sj_bark,
      sj_barkDark,
      sj_rand,
    ),
  );
  const sj_trunk = mergeGeometries(sj_trunkParts, false)!;
  sj_trunkParts.forEach((sj_p) => sj_p.dispose());

  let sj_canopy: BufferGeometry;
  let sj_strands: BufferGeometry | undefined;
  if (sj_kind === 'willow') {
    sj_canopy = canopyCards(
      sj_blobs,
      sj_rand,
      sj_height,
      new Color('#e8f2c6'),
      0.1,
      0.9,
      sj_density * 0.7,
    );
    sj_strands = willowCurtain(sj_willowAnchors, sj_rand, sj_willowCrown, new Color('#ffffff'));
  } else {
    sj_canopy = canopyCards(
      sj_blobs,
      sj_rand,
      sj_height,
      sj_tint,
      sj_tintVariance,
      sj_cardScale,
      sj_density,
    );
  }

  let sj_crownRadius = 0;
  for (const sj_b of sj_blobs)
    sj_crownRadius = Math.max(
      sj_crownRadius,
      Math.hypot(sj_b.center.x, sj_b.center.z) + sj_b.radius,
    );
  for (const sj_a of sj_willowAnchors)
    sj_crownRadius = Math.max(sj_crownRadius, Math.hypot(sj_a.at.x, sj_a.at.z) + 0.6);

  return {
    trunk: sj_trunk,
    canopy: sj_canopy,
    strands: sj_strands,
    height: sj_height,
    trunkRadius: sj_trunkRadius,
    crownRadius: sj_crownRadius,
    blobs: sj_blobs.map((sj_b) => ({ center: sj_b.center.clone(), radius: sj_b.radius })),
  };
}
