import { Color, Group, InstancedMesh, Matrix4, Quaternion, Vector3, type Scene } from 'three';
import { createRock, type RockStyle } from './rockGeometry';
import { createRockMaterial } from './rockMaterial';
import { hash2 } from '../../utils/random';

export type { RockStyle } from './rockGeometry';

export interface RockInstance {
  x: number;
  y: number;
  z: number;
  /** uniform size in metres (roughly the radius) */
  size: number;
  rot: number;
  style: RockStyle;
  /** sink into the ground (fraction of size) */
  sink?: number;
  tilt?: number;
  /** tilt axis around Y (defaults to the rock's own x axis) */
  tiltDir?: number;
}

const m4 = new Matrix4();
const q = new Quaternion();
const q2 = new Quaternion();
const v3 = new Vector3();
const s3 = new Vector3();
const axis = new Vector3();
const Y = new Vector3(0, 1, 0);
const tint = new Color();
const STYLES: RockStyle[] = ['boulder', 'flat', 'tall', 'cliff'];
const VARIANTS = 4;

/**
 * Every rock in the valley: a few chiselled variants per style drawn as InstancedMeshes,
 * each instance rotated, scaled and tinted slightly differently.
 */
export class Rocks {
  readonly group = new Group();

  constructor(rocks: RockInstance[]) {
    const material = createRockMaterial();
    for (const style of STYLES) {
      const list = rocks.filter((r) => r.style === style);
      if (!list.length) continue;
      const si = STYLES.indexOf(style);
      const buckets: RockInstance[][] = Array.from({ length: VARIANTS }, () => []);
      list.forEach((r, i) => buckets[i % VARIANTS]!.push(r));
      buckets.forEach((bucket, vi) => {
        if (!bucket.length) return;
        const geo = createRock(1000 + vi * 17 + si * 101, style);
        const mesh = new InstancedMesh(geo, material, bucket.length);
        bucket.forEach((r, i) => {
          q.setFromAxisAngle(Y, r.rot);
          if (r.tilt) {
            const d = r.tiltDir ?? r.rot;
            axis.set(Math.cos(d), 0, -Math.sin(d));
            q2.setFromAxisAngle(axis, r.tilt);
            q.premultiply(q2);
          }
          m4.compose(v3.set(r.x, r.y - r.size * (r.sink ?? 0.2), r.z), q, s3.setScalar(r.size));
          mesh.setMatrixAt(i, m4);
          // slight per-rock tone and warmth
          const h = hash2(r.x * 3.1, r.z * 1.7, 5);
          const h2 = hash2(r.z * 2.3, r.x * 0.9, 9);
          tint.setRGB(0.9 + h * 0.18 + h2 * 0.03, 0.9 + h * 0.16, 0.9 + h * 0.13 - h2 * 0.03);
          mesh.setColorAt(i, tint);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = `rocks-${style}-${vi}`;
        this.group.add(mesh);
      });
    }
  }

  addTo(scene: Scene): void {
    scene.add(this.group);
  }
}
