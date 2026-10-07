import {
  BufferAttribute,
  Color,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mul, T, type ArchBuilder } from './Builder';
import { box, post } from './geometry';
import { addStoneLantern, sj_PAL } from './parts';
import type { CollisionWorld } from '../../physics/CollisionWorld';
import { Random } from '../../utils/random';

export interface Dummy {
  x: number;
  y: number;
  z: number;
  yaw: number;
  tilt: number;
  tiltVel: number;
  spin: number;
  spinVel: number;
}

function colored(sj_g: BufferGeometry, sj_color: string, sj_m: Matrix4): BufferGeometry {
  const sj_out = (sj_g.index ? sj_g.toNonIndexed() : sj_g).applyMatrix4(sj_m);
  sj_out.deleteAttribute('uv');
  const sj_c = new Color(sj_color);
  const sj_arr = new Float32Array(sj_out.attributes.position!.count * 3);
  for (let sj_i = 0; sj_i < sj_arr.length; sj_i += 3) sj_arr.set([sj_c.r, sj_c.g, sj_c.b], sj_i);
  sj_out.setAttribute('color', new BufferAttribute(sj_arr, 3));
  return sj_out;
}

/** A tapered wooden limb from `sj_root` along `sj_dir` (unit), with a rounded end. */
function limb(
  sj_root: Vector3,
  sj_dir: Vector3,
  sj_length: number,
  sj_r0: number,
  sj_r1: number,
  sj_color: string,
): BufferGeometry[] {
  const sj_rot = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), sj_dir);
  const sj_mid = sj_root.clone().addScaledVector(sj_dir, sj_length / 2);
  const sj_tip = sj_root.clone().addScaledVector(sj_dir, sj_length);
  return [
    colored(
      new CylinderGeometry(sj_r1, sj_r0, sj_length, 8),
      sj_color,
      new Matrix4().compose(sj_mid, sj_rot, new Vector3(1, 1, 1)),
    ),
    colored(new SphereGeometry(sj_r1 * 1.15, 8, 6), sj_color, T(sj_tip.x, sj_tip.y, sj_tip.z)),
  ];
}

/** Direction at `sj_angle` around the post (0 = local +z, the dummy's front), tilted up by `pitch`. */
function around(sj_angle: number, sj_pitch: number): Vector3 {
  return new Vector3(
    Math.sin(sj_angle) * Math.cos(sj_pitch),
    Math.sin(sj_pitch),
    Math.cos(sj_angle) * Math.cos(sj_pitch),
  );
}

/**
 * A wooden training dummy with arms all the way round, like the spinning wooden warriors
 * of a kung fu training hall: a carved post on a round plinth, three tiers of arms set at
 * staggered angles (so some arm always faces whoever steps up, from any side) and three
 * bent legs, each tier fixed in a brass collar. Faces local +z.
 */
function createDummyGeometry(): BufferGeometry {
  const sj_wood = '#8a5a36';
  const sj_dark = '#5b3a22';
  const sj_arm = '#6e4529';
  const sj_brass = '#c49a45';
  const sj_parts: BufferGeometry[] = [
    colored(new CylinderGeometry(0.44, 0.5, 0.16, 18), '#6f6a61', T(0, 0.08, 0)),
    colored(new CylinderGeometry(0.3, 0.34, 0.1, 16), sj_dark, T(0, 0.21, 0)),
    colored(post(0.19, 1.66, 14, 0.175), sj_wood, T(0, 0.2, 0)),
    // a rounded, carved head with a band
    colored(new SphereGeometry(0.2, 14, 10), sj_wood, T(0, 1.9, 0, 0, 0, 0, 1, 0.85, 1)),
    colored(new CylinderGeometry(0.205, 0.205, 0.07, 14), sj_dark, T(0, 1.78, 0)),
    colored(new SphereGeometry(0.06, 8, 6), sj_brass, T(0, 2.07, 0)),
  ];
  // tiers: height, number of limbs, angle offset, pitch, length, radius
  const sj_tiers = [
    { y: 1.5, n: 3, offset: 0, pitch: 0.22, length: 0.6, r: 0.056 },
    { y: 1.16, n: 3, offset: Math.PI / 3, pitch: 0, length: 0.54, r: 0.056 },
  ];
  for (const sj_t of sj_tiers) {
    sj_parts.push(colored(new CylinderGeometry(0.215, 0.215, 0.08, 14), sj_brass, T(0, sj_t.y, 0)));
    for (let sj_k = 0; sj_k < sj_t.n; sj_k++) {
      const sj_a = sj_t.offset + (sj_k / sj_t.n) * Math.PI * 2;
      const sj_dir = around(sj_a, sj_t.pitch);
      const sj_root = new Vector3(sj_dir.x * 0.16, sj_t.y, sj_dir.z * 0.16);
      sj_parts.push(...limb(sj_root, sj_dir, sj_t.length, sj_t.r, sj_t.r * 0.82, sj_arm));
      // a brass ferrule where the arm enters the post
      sj_parts.push(
        colored(
          new CylinderGeometry(sj_t.r * 1.35, sj_t.r * 1.35, 0.06, 8),
          sj_brass,
          new Matrix4().compose(
            sj_root.clone().addScaledVector(sj_dir, 0.06),
            new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), sj_dir),
            new Vector3(1, 1, 1),
          ),
        ),
      );
    }
  }
  // bent legs: out from the post, then down at the knee
  const sj_legY = 0.66;
  sj_parts.push(colored(new CylinderGeometry(0.205, 0.205, 0.07, 14), sj_brass, T(0, sj_legY, 0)));
  for (let sj_k = 0; sj_k < 3; sj_k++) {
    const sj_a = (sj_k / 3) * Math.PI * 2;
    const sj_out = around(sj_a, 0.12);
    const sj_root = new Vector3(sj_out.x * 0.16, sj_legY, sj_out.z * 0.16);
    const sj_knee = sj_root.clone().addScaledVector(sj_out, 0.3);
    sj_parts.push(...limb(sj_root, sj_out, 0.3, 0.055, 0.05, sj_arm));
    sj_parts.push(...limb(sj_knee, around(sj_a, -1.0), 0.32, 0.05, 0.045, sj_arm));
  }
  const sj_merged = mergeGeometries(sj_parts, false)!;
  sj_merged.computeVertexNormals();
  return sj_merged;
}

const sj_m4 = new Matrix4();
const sj_q = new Quaternion();
const sj_qt = new Quaternion();
const sj_X = new Vector3(1, 0, 0);
const sj_Y = new Vector3(0, 1, 0);
const sj_one = new Vector3(1, 1, 1);
const sj_v3 = new Vector3();

/**
 * The training grounds: wooden dummies (one per skill group) that wobble and spin when
 * struck, plum-blossom posts to hop across, a weapon rack and a big drum.
 */
export class TrainingGround {
  readonly dummies: Dummy[] = [];
  readonly mesh: InstancedMesh;
  readonly drum: { x: number; y: number; z: number };
  readonly posts: { x: number; y: number; z: number; top: number }[] = [];

  constructor(
    sj_b: ArchBuilder,
    sj_col: CollisionWorld,
    sj_centre: { x: number; z: number },
    sj_ground: (sj_x: number, sj_z: number) => number,
    sj_dummyCount: number,
  ) {
    const sj_count = Math.max(1, Math.min(6, sj_dummyCount));
    const sj_spread = Math.min(1.1, 0.33 * (sj_count - 1));
    for (let sj_i = 0; sj_i < sj_count; sj_i++) {
      const sj_t = sj_count === 1 ? 0 : sj_i / (sj_count - 1) - 0.5;
      const sj_a = sj_t * 2 * sj_spread; // around "north"
      const sj_r = 6.6;
      const sj_x = sj_centre.x + Math.sin(sj_a) * sj_r;
      const sj_z = sj_centre.z - Math.cos(sj_a) * sj_r;
      const sj_yaw = Math.atan2(sj_centre.x - sj_x, sj_centre.z - sj_z);
      const sj_y = sj_ground(sj_x, sj_z);
      this.dummies.push({
        x: sj_x,
        y: sj_y,
        z: sj_z,
        yaw: sj_yaw,
        tilt: 0,
        tiltVel: 0,
        spin: 0,
        spinVel: 0,
      });
      sj_col.circle(sj_x, sj_z, 0.3, sj_y, sj_y + 1.9, `dummy:${sj_i}`);
    }
    this.mesh = new InstancedMesh(
      createDummyGeometry(),
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
      sj_count,
    );
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'training-dummies';
    this.update(0);
    this.mesh.computeBoundingSphere();

    // Plum-blossom posts: a grid of stakes of rising height to hop across.
    const sj_rand = new Random(12);
    const sj_gx = sj_centre.x - 6.2;
    const sj_gz = sj_centre.z + 3.2;
    for (let sj_row = 0; sj_row < 4; sj_row++) {
      for (let sj_c = 0; sj_c < 3; sj_c++) {
        const sj_x = sj_gx + sj_c * 1.25 + (sj_row % 2) * 0.6;
        const sj_z = sj_gz + sj_row * 1.25;
        const sj_y = sj_ground(sj_x, sj_z);
        const sj_h = 0.55 + sj_row * 0.32 + sj_c * 0.08 + sj_rand.range(0, 0.12);
        sj_b.add(
          'paint',
          post(0.2, sj_h, 10),
          sj_row % 2 ? '#7d5234' : '#8e6040',
          T(sj_x, sj_y, sj_z),
        );
        sj_b.add(
          'paint',
          new CylinderGeometry(0.21, 0.21, 0.04, 10),
          '#5b3a22',
          T(sj_x, sj_y + sj_h - 0.02, sj_z),
        );
        sj_col.addPlatform({
          shape: { type: 'circle', x: sj_x, z: sj_z, r: 0.25 },
          top: sj_y + sj_h,
          bottom: sj_y - 0.5,
          surface: 'wood',
        });
        this.posts.push({ x: sj_x, y: sj_y, z: sj_z, top: sj_y + sj_h });
      }
    }

    // Drum on a stand, facing the plaza.
    const sj_dx = sj_centre.x + 7.2;
    const sj_dz = sj_centre.z + 2.2;
    const sj_dy = sj_ground(sj_dx, sj_dz);
    const sj_yaw = Math.atan2(sj_centre.x - sj_dx, sj_centre.z - sj_dz);
    const sj_dm = T(sj_dx, sj_dy, sj_dz, 0, sj_yaw);
    for (const sj_s of [-1, 1])
      sj_b.add('paint', post(0.08, 1.6, 6), sj_PAL.wood, mul(sj_dm, T(sj_s * 0.85, 0, 0)));
    sj_b.add('paint', box(1.85, 0.12, 0.12), sj_PAL.wood, mul(sj_dm, T(0, 1.55, 0)));
    sj_b.add(
      'paint',
      new CylinderGeometry(0.72, 0.72, 0.8, 24).rotateX(Math.PI / 2),
      sj_PAL.vermilion,
      mul(sj_dm, T(0, 1.05, 0)),
    );
    for (const sj_s of [-1, 1]) {
      sj_b.add(
        'paint',
        new CylinderGeometry(0.74, 0.74, 0.03, 24).rotateX(Math.PI / 2),
        '#efe0c0',
        mul(sj_dm, T(0, 1.05, sj_s * 0.41)),
      );
      for (let sj_k = 0; sj_k < 16; sj_k++) {
        const sj_a = (sj_k / 16) * Math.PI * 2;
        sj_b.add(
          'paint',
          new SphereGeometry(0.03, 4, 3),
          sj_PAL.gold,
          mul(sj_dm, T(Math.cos(sj_a) * 0.68, 1.05 + Math.sin(sj_a) * 0.68, sj_s * 0.38)),
        );
      }
    }
    sj_col.circle(sj_dx, sj_dz, 0.9, sj_dy, sj_dy + 1.8, 'drum');
    this.drum = { x: sj_dx, y: sj_dy + 1.05, z: sj_dz };

    // Weapon rack with staffs.
    const sj_rx = sj_centre.x - 8.2;
    const sj_rz = sj_centre.z - 3.4;
    const sj_ry = sj_ground(sj_rx, sj_rz);
    const sj_rm = T(sj_rx, sj_ry, sj_rz, 0, 0.9);
    for (const sj_s of [-1, 1])
      sj_b.add('paint', post(0.06, 1.5, 6), sj_PAL.wood, mul(sj_rm, T(sj_s * 0.9, 0, 0)));
    sj_b.add('paint', box(1.95, 0.08, 0.1), sj_PAL.wood, mul(sj_rm, T(0, 1.4, 0)));
    sj_b.add('paint', box(1.95, 0.08, 0.1), sj_PAL.wood, mul(sj_rm, T(0, 0.35, 0.15)));
    for (let sj_k = 0; sj_k < 5; sj_k++) {
      sj_b.add(
        'paint',
        post(0.025, 1.9, 5),
        sj_k % 2 ? '#b98a55' : '#9c6b3e',
        mul(sj_rm, T(-0.7 + sj_k * 0.35, 0.3, 0.2, -0.2, 0, 0)),
      );
    }
    sj_col.box(sj_rx, sj_rz, 1.0, 0.3, 0.9, sj_ry, sj_ry + 1.6, 'rack');

    // Stone lanterns at the plaza entrance (towards the crossroads).
    for (const sj_s of [-1, 1]) {
      const sj_lx = sj_centre.x + 11.2;
      const sj_lz = sj_centre.z + sj_s * 2.6;
      addStoneLantern(sj_b, T(sj_lx, sj_ground(sj_lx, sj_lz), sj_lz), 0.9);
      sj_col.circle(
        sj_lx,
        sj_lz,
        0.4,
        sj_ground(sj_lx, sj_lz),
        sj_ground(sj_lx, sj_lz) + 2,
        'lantern',
      );
    }
  }

  addTo(sj_scene: Scene): void {
    sj_scene.add(this.mesh);
  }

  /** Nearest dummy to a point within `sj_range`, or -1. */
  nearest(sj_x: number, sj_z: number, sj_range: number): number {
    let sj_best = -1;
    let sj_bestD = sj_range;
    this.dummies.forEach((sj_d, sj_i) => {
      const sj_dd = Math.hypot(sj_d.x - sj_x, sj_d.z - sj_z);
      if (sj_dd < sj_bestD) {
        sj_bestD = sj_dd;
        sj_best = sj_i;
      }
    });
    return sj_best;
  }

  /** Knock a dummy: it rocks back and spins a little. */
  hit(sj_index: number, sj_fromX: number, sj_fromZ: number, sj_strength = 1): void {
    const sj_d = this.dummies[sj_index];
    if (!sj_d) return;
    sj_d.tiltVel += 5.5 * sj_strength;
    const sj_side =
      Math.sign(
        (sj_fromX - sj_d.x) * Math.cos(sj_d.yaw) - (sj_fromZ - sj_d.z) * Math.sin(sj_d.yaw),
      ) || 1;
    sj_d.spinVel += sj_side * 9 * sj_strength;
  }

  update(sj_dt: number): void {
    this.dummies.forEach((sj_d, sj_i) => {
      // damped springs back to rest
      sj_d.tiltVel += (-sj_d.tilt * 90 - sj_d.tiltVel * 6) * sj_dt;
      sj_d.tilt += sj_d.tiltVel * sj_dt;
      sj_d.spinVel += (-sj_d.spin * 30 - sj_d.spinVel * 3.5) * sj_dt;
      sj_d.spin += sj_d.spinVel * sj_dt;
      sj_q.setFromAxisAngle(sj_Y, sj_d.yaw + sj_d.spin);
      sj_qt.setFromAxisAngle(sj_X, -sj_d.tilt * 0.35);
      sj_q.multiply(sj_qt);
      sj_m4.compose(sj_v3.set(sj_d.x, sj_d.y, sj_d.z), sj_q, sj_one);
      this.mesh.setMatrixAt(sj_i, sj_m4);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
