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
import { addStoneLantern, PAL } from './parts';
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

function colored(g: BufferGeometry, color: string, m: Matrix4): BufferGeometry {
  const out = (g.index ? g.toNonIndexed() : g).applyMatrix4(m);
  out.deleteAttribute('uv');
  const c = new Color(color);
  const arr = new Float32Array(out.attributes.position!.count * 3);
  for (let i = 0; i < arr.length; i += 3) arr.set([c.r, c.g, c.b], i);
  out.setAttribute('color', new BufferAttribute(arr, 3));
  return out;
}

/** A tapered wooden limb from `root` along `dir` (unit), with a rounded end. */
function limb(
  root: Vector3,
  dir: Vector3,
  length: number,
  r0: number,
  r1: number,
  color: string,
): BufferGeometry[] {
  const rot = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
  const mid = root.clone().addScaledVector(dir, length / 2);
  const tip = root.clone().addScaledVector(dir, length);
  return [
    colored(
      new CylinderGeometry(r1, r0, length, 8),
      color,
      new Matrix4().compose(mid, rot, new Vector3(1, 1, 1)),
    ),
    colored(new SphereGeometry(r1 * 1.15, 8, 6), color, T(tip.x, tip.y, tip.z)),
  ];
}

/** Direction at `angle` around the post (0 = local +z, the dummy's front), tilted up by `pitch`. */
function around(angle: number, pitch: number): Vector3 {
  return new Vector3(
    Math.sin(angle) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(angle) * Math.cos(pitch),
  );
}

/**
 * A wooden training dummy with arms all the way round, like the spinning wooden warriors
 * of a kung fu training hall: a carved post on a round plinth, three tiers of arms set at
 * staggered angles (so some arm always faces whoever steps up, from any side) and three
 * bent legs, each tier fixed in a brass collar. Faces local +z.
 */
function createDummyGeometry(): BufferGeometry {
  const wood = '#8a5a36';
  const dark = '#5b3a22';
  const arm = '#6e4529';
  const brass = '#c49a45';
  const parts: BufferGeometry[] = [
    colored(new CylinderGeometry(0.44, 0.5, 0.16, 18), '#6f6a61', T(0, 0.08, 0)),
    colored(new CylinderGeometry(0.3, 0.34, 0.1, 16), dark, T(0, 0.21, 0)),
    colored(post(0.19, 1.66, 14, 0.175), wood, T(0, 0.2, 0)),
    // a rounded, carved head with a band
    colored(new SphereGeometry(0.2, 14, 10), wood, T(0, 1.9, 0, 0, 0, 0, 1, 0.85, 1)),
    colored(new CylinderGeometry(0.205, 0.205, 0.07, 14), dark, T(0, 1.78, 0)),
    colored(new SphereGeometry(0.06, 8, 6), brass, T(0, 2.07, 0)),
  ];
  // tiers: height, number of limbs, angle offset, pitch, length, radius
  const tiers = [
    { y: 1.5, n: 3, offset: 0, pitch: 0.22, length: 0.6, r: 0.056 },
    { y: 1.16, n: 3, offset: Math.PI / 3, pitch: 0, length: 0.54, r: 0.056 },
  ];
  for (const t of tiers) {
    parts.push(colored(new CylinderGeometry(0.215, 0.215, 0.08, 14), brass, T(0, t.y, 0)));
    for (let k = 0; k < t.n; k++) {
      const a = t.offset + (k / t.n) * Math.PI * 2;
      const dir = around(a, t.pitch);
      const root = new Vector3(dir.x * 0.16, t.y, dir.z * 0.16);
      parts.push(...limb(root, dir, t.length, t.r, t.r * 0.82, arm));
      // a brass ferrule where the arm enters the post
      parts.push(
        colored(
          new CylinderGeometry(t.r * 1.35, t.r * 1.35, 0.06, 8),
          brass,
          new Matrix4().compose(
            root.clone().addScaledVector(dir, 0.06),
            new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir),
            new Vector3(1, 1, 1),
          ),
        ),
      );
    }
  }
  // bent legs: out from the post, then down at the knee
  const legY = 0.66;
  parts.push(colored(new CylinderGeometry(0.205, 0.205, 0.07, 14), brass, T(0, legY, 0)));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const out = around(a, 0.12);
    const root = new Vector3(out.x * 0.16, legY, out.z * 0.16);
    const knee = root.clone().addScaledVector(out, 0.3);
    parts.push(...limb(root, out, 0.3, 0.055, 0.05, arm));
    parts.push(...limb(knee, around(a, -1.0), 0.32, 0.05, 0.045, arm));
  }
  const merged = mergeGeometries(parts, false)!;
  merged.computeVertexNormals();
  return merged;
}

const m4 = new Matrix4();
const q = new Quaternion();
const qt = new Quaternion();
const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const one = new Vector3(1, 1, 1);
const v3 = new Vector3();

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
    b: ArchBuilder,
    col: CollisionWorld,
    centre: { x: number; z: number },
    ground: (x: number, z: number) => number,
    dummyCount: number,
  ) {
    const count = Math.max(1, Math.min(6, dummyCount));
    const spread = Math.min(1.1, 0.33 * (count - 1));
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1) - 0.5;
      const a = t * 2 * spread; // around "north"
      const r = 6.6;
      const x = centre.x + Math.sin(a) * r;
      const z = centre.z - Math.cos(a) * r;
      const yaw = Math.atan2(centre.x - x, centre.z - z);
      const y = ground(x, z);
      this.dummies.push({ x, y, z, yaw, tilt: 0, tiltVel: 0, spin: 0, spinVel: 0 });
      col.circle(x, z, 0.3, y, y + 1.9, `dummy:${i}`);
    }
    this.mesh = new InstancedMesh(
      createDummyGeometry(),
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
      count,
    );
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'training-dummies';
    this.update(0);
    this.mesh.computeBoundingSphere();

    // Plum-blossom posts: a grid of stakes of rising height to hop across.
    const rand = new Random(12);
    const gx = centre.x - 6.2;
    const gz = centre.z + 3.2;
    for (let row = 0; row < 4; row++) {
      for (let c = 0; c < 3; c++) {
        const x = gx + c * 1.25 + (row % 2) * 0.6;
        const z = gz + row * 1.25;
        const y = ground(x, z);
        const h = 0.55 + row * 0.32 + c * 0.08 + rand.range(0, 0.12);
        b.add('paint', post(0.2, h, 10), row % 2 ? '#7d5234' : '#8e6040', T(x, y, z));
        b.add(
          'paint',
          new CylinderGeometry(0.21, 0.21, 0.04, 10),
          '#5b3a22',
          T(x, y + h - 0.02, z),
        );
        col.addPlatform({
          shape: { type: 'circle', x, z, r: 0.25 },
          top: y + h,
          bottom: y - 0.5,
          surface: 'wood',
        });
        this.posts.push({ x, y, z, top: y + h });
      }
    }

    // Drum on a stand, facing the plaza.
    const dx = centre.x + 7.2;
    const dz = centre.z + 2.2;
    const dy = ground(dx, dz);
    const yaw = Math.atan2(centre.x - dx, centre.z - dz);
    const dm = T(dx, dy, dz, 0, yaw);
    for (const s of [-1, 1])
      b.add('paint', post(0.08, 1.6, 6), PAL.wood, mul(dm, T(s * 0.85, 0, 0)));
    b.add('paint', box(1.85, 0.12, 0.12), PAL.wood, mul(dm, T(0, 1.55, 0)));
    b.add(
      'paint',
      new CylinderGeometry(0.72, 0.72, 0.8, 24).rotateX(Math.PI / 2),
      PAL.vermilion,
      mul(dm, T(0, 1.05, 0)),
    );
    for (const s of [-1, 1]) {
      b.add(
        'paint',
        new CylinderGeometry(0.74, 0.74, 0.03, 24).rotateX(Math.PI / 2),
        '#efe0c0',
        mul(dm, T(0, 1.05, s * 0.41)),
      );
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        b.add(
          'paint',
          new SphereGeometry(0.03, 4, 3),
          PAL.gold,
          mul(dm, T(Math.cos(a) * 0.68, 1.05 + Math.sin(a) * 0.68, s * 0.38)),
        );
      }
    }
    col.circle(dx, dz, 0.9, dy, dy + 1.8, 'drum');
    this.drum = { x: dx, y: dy + 1.05, z: dz };

    // Weapon rack with staffs.
    const rx = centre.x - 8.2;
    const rz = centre.z - 3.4;
    const ry = ground(rx, rz);
    const rm = T(rx, ry, rz, 0, 0.9);
    for (const s of [-1, 1])
      b.add('paint', post(0.06, 1.5, 6), PAL.wood, mul(rm, T(s * 0.9, 0, 0)));
    b.add('paint', box(1.95, 0.08, 0.1), PAL.wood, mul(rm, T(0, 1.4, 0)));
    b.add('paint', box(1.95, 0.08, 0.1), PAL.wood, mul(rm, T(0, 0.35, 0.15)));
    for (let k = 0; k < 5; k++) {
      b.add(
        'paint',
        post(0.025, 1.9, 5),
        k % 2 ? '#b98a55' : '#9c6b3e',
        mul(rm, T(-0.7 + k * 0.35, 0.3, 0.2, -0.2, 0, 0)),
      );
    }
    col.box(rx, rz, 1.0, 0.3, 0.9, ry, ry + 1.6, 'rack');

    // Stone lanterns at the plaza entrance (towards the crossroads).
    for (const s of [-1, 1]) {
      const lx = centre.x + 11.2;
      const lz = centre.z + s * 2.6;
      addStoneLantern(b, T(lx, ground(lx, lz), lz), 0.9);
      col.circle(lx, lz, 0.4, ground(lx, lz), ground(lx, lz) + 2, 'lantern');
    }
  }

  addTo(scene: Scene): void {
    scene.add(this.mesh);
  }

  /** Nearest dummy to a point within `range`, or -1. */
  nearest(x: number, z: number, range: number): number {
    let best = -1;
    let bestD = range;
    this.dummies.forEach((d, i) => {
      const dd = Math.hypot(d.x - x, d.z - z);
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    });
    return best;
  }

  /** Knock a dummy: it rocks back and spins a little. */
  hit(index: number, fromX: number, fromZ: number, strength = 1): void {
    const d = this.dummies[index];
    if (!d) return;
    d.tiltVel += 5.5 * strength;
    const side = Math.sign((fromX - d.x) * Math.cos(d.yaw) - (fromZ - d.z) * Math.sin(d.yaw)) || 1;
    d.spinVel += side * 9 * strength;
  }

  update(dt: number): void {
    this.dummies.forEach((d, i) => {
      // damped springs back to rest
      d.tiltVel += (-d.tilt * 90 - d.tiltVel * 6) * dt;
      d.tilt += d.tiltVel * dt;
      d.spinVel += (-d.spin * 30 - d.spinVel * 3.5) * dt;
      d.spin += d.spinVel * dt;
      q.setFromAxisAngle(Y, d.yaw + d.spin);
      qt.setFromAxisAngle(X, -d.tilt * 0.35);
      q.multiply(qt);
      m4.compose(v3.set(d.x, d.y, d.z), q, one);
      this.mesh.setMatrixAt(i, m4);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
