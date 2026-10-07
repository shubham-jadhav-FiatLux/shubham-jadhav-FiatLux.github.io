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

const sj_m4 = new Matrix4();
const sj_q = new Quaternion();
const sj_q2 = new Quaternion();
const sj_v3 = new Vector3();
const sj_s3 = new Vector3();
const sj_axis = new Vector3();
const sj_Y = new Vector3(0, 1, 0);
const sj_tint = new Color();
const sj_STYLES: RockStyle[] = ['boulder', 'flat', 'tall', 'cliff'];
const sj_VARIANTS = 4;

/**
 * Every rock in the valley: a few chiselled variants per style drawn as InstancedMeshes,
 * each instance rotated, scaled and tinted slightly differently.
 */
export class Rocks {
  readonly group = new Group();

  constructor(sj_rocks: RockInstance[]) {
    const sj_material = createRockMaterial();
    for (const sj_style of sj_STYLES) {
      const sj_list = sj_rocks.filter((sj_r) => sj_r.style === sj_style);
      if (!sj_list.length) continue;
      const sj_si = sj_STYLES.indexOf(sj_style);
      const sj_buckets: RockInstance[][] = Array.from({ length: sj_VARIANTS }, () => []);
      sj_list.forEach((sj_r, sj_i) => sj_buckets[sj_i % sj_VARIANTS]!.push(sj_r));
      sj_buckets.forEach((sj_bucket, sj_vi) => {
        if (!sj_bucket.length) return;
        const sj_geo = createRock(1000 + sj_vi * 17 + sj_si * 101, sj_style);
        const sj_mesh = new InstancedMesh(sj_geo, sj_material, sj_bucket.length);
        sj_bucket.forEach((sj_r, sj_i) => {
          sj_q.setFromAxisAngle(sj_Y, sj_r.rot);
          if (sj_r.tilt) {
            const sj_d = sj_r.tiltDir ?? sj_r.rot;
            sj_axis.set(Math.cos(sj_d), 0, -Math.sin(sj_d));
            sj_q2.setFromAxisAngle(sj_axis, sj_r.tilt);
            sj_q.premultiply(sj_q2);
          }
          sj_m4.compose(
            sj_v3.set(sj_r.x, sj_r.y - sj_r.size * (sj_r.sink ?? 0.2), sj_r.z),
            sj_q,
            sj_s3.setScalar(sj_r.size),
          );
          sj_mesh.setMatrixAt(sj_i, sj_m4);
          // slight per-rock tone and warmth
          const sj_h = hash2(sj_r.x * 3.1, sj_r.z * 1.7, 5);
          const sj_h2 = hash2(sj_r.z * 2.3, sj_r.x * 0.9, 9);
          sj_tint.setRGB(
            0.9 + sj_h * 0.18 + sj_h2 * 0.03,
            0.9 + sj_h * 0.16,
            0.9 + sj_h * 0.13 - sj_h2 * 0.03,
          );
          sj_mesh.setColorAt(sj_i, sj_tint);
        });
        sj_mesh.instanceMatrix.needsUpdate = true;
        if (sj_mesh.instanceColor) sj_mesh.instanceColor.needsUpdate = true;
        sj_mesh.computeBoundingSphere();
        sj_mesh.castShadow = true;
        sj_mesh.receiveShadow = true;
        sj_mesh.name = `rocks-${sj_style}-${sj_vi}`;
        this.group.add(sj_mesh);
      });
    }
  }

  addTo(sj_scene: Scene): void {
    sj_scene.add(this.group);
  }
}
