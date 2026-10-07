import {
  BufferAttribute,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
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
import { sj_globalUniforms } from '../../render/uniforms';
import { sj_WATER_LEVEL } from '../layout';

function padGeometry(): BufferGeometry {
  // A round leaf with a notch, edges curling up slightly.
  const sj_g = new CircleGeometry(0.5, 22, 0.35, Math.PI * 2 - 0.35);
  sj_g.rotateX(-Math.PI / 2);
  const sj_pos = sj_g.attributes.position as BufferAttribute;
  const sj_colors = new Float32Array(sj_pos.count * 3);
  const sj_inner = new Color('#5d8f3a');
  const sj_outer = new Color('#3f6f2c');
  const sj_c = new Color();
  for (let sj_i = 0; sj_i < sj_pos.count; sj_i++) {
    const sj_r = Math.hypot(sj_pos.getX(sj_i), sj_pos.getZ(sj_i)) / 0.5;
    sj_pos.setY(sj_i, sj_r * sj_r * 0.04);
    sj_c.copy(sj_inner).lerp(sj_outer, sj_r);
    sj_colors.set([sj_c.r, sj_c.g, sj_c.b], sj_i * 3);
  }
  sj_g.setAttribute('color', new BufferAttribute(sj_colors, 3));
  sj_g.deleteAttribute('uv');
  sj_g.computeVertexNormals();
  return sj_g;
}

function flowerGeometry(): BufferGeometry {
  const sj_parts: BufferGeometry[] = [];
  const sj_base = new Color('#fdf1f4');
  const sj_tip = new Color('#ef7fa6');
  const sj_ring = (
    sj_count: number,
    sj_length: number,
    sj_tilt: number,
    sj_lift: number,
    sj_offset: number,
  ) => {
    for (let sj_i = 0; sj_i < sj_count; sj_i++) {
      const sj_petal = new SphereGeometry(0.1, 8, 6);
      sj_petal.scale(0.45, 1, 0.22);
      sj_petal.translate(0, 0.1, 0);
      sj_petal.scale(1, sj_length, 1);
      const sj_pos = sj_petal.attributes.position as BufferAttribute;
      const sj_colors = new Float32Array(sj_pos.count * 3);
      const sj_c = new Color();
      for (let sj_k = 0; sj_k < sj_pos.count; sj_k++) {
        const sj_t = Math.min(1, Math.max(0, sj_pos.getY(sj_k) / (0.2 * sj_length)));
        sj_c.copy(sj_base).lerp(sj_tip, Math.pow(sj_t, 1.6));
        sj_colors.set([sj_c.r, sj_c.g, sj_c.b], sj_k * 3);
      }
      sj_petal.setAttribute('color', new BufferAttribute(sj_colors, 3));
      sj_petal.rotateX(sj_tilt);
      sj_petal.rotateY((sj_i / sj_count) * Math.PI * 2 + sj_offset);
      sj_petal.translate(0, sj_lift, 0);
      sj_petal.deleteAttribute('uv');
      sj_parts.push(sj_petal.toNonIndexed());
    }
  };
  sj_ring(8, 1.25, 0.95, 0.02, 0);
  sj_ring(7, 1.1, 0.55, 0.04, 0.4);
  sj_ring(5, 0.9, 0.25, 0.06, 0.9);
  const sj_centre = new SphereGeometry(0.05, 8, 6);
  sj_centre.scale(1, 0.5, 1);
  sj_centre.translate(0, 0.08, 0);
  const sj_cc = new Float32Array(sj_centre.attributes.position!.count * 3);
  const sj_yellow = new Color('#f2c94c');
  for (let sj_k = 0; sj_k < sj_cc.length; sj_k += 3)
    sj_cc.set([sj_yellow.r, sj_yellow.g, sj_yellow.b], sj_k);
  sj_centre.setAttribute('color', new BufferAttribute(sj_cc, 3));
  sj_centre.deleteAttribute('uv');
  sj_parts.push(sj_centre.toNonIndexed());
  const sj_merged = mergeGeometries(sj_parts, false)!;
  sj_merged.computeVertexNormals();
  return sj_merged;
}

const sj_m4 = new Matrix4();
const sj_q = new Quaternion();
const sj_v3 = new Vector3();
const sj_s3 = new Vector3();
const sj_Y = new Vector3(0, 1, 0);

/** Lily pads drifting in the shallows, some carrying pink lotus flowers. They bob gently. */
export class Lotus {
  readonly group = new Group();

  constructor(sj_pads: { x: number; z: number; s: number; rot: number; flower: boolean }[]) {
    const sj_material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.55,
      side: DoubleSide,
    });
    sj_material.onBeforeCompile = (sj_shader) => {
      sj_shader.uniforms.uTime = sj_globalUniforms.uTime;
      sj_shader.vertexShader = sj_shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 ip = instanceMatrix[3].xyz;
            transformed.y += sin(uTime * 1.3 + ip.x * 0.7 + ip.z * 0.4) * 0.025;
          #endif`,
        );
    };
    const sj_padMesh = new InstancedMesh(padGeometry(), sj_material, sj_pads.length);
    const sj_flowers = sj_pads.filter((sj_p) => sj_p.flower);
    const sj_flowerMesh = new InstancedMesh(
      flowerGeometry(),
      sj_material,
      Math.max(1, sj_flowers.length),
    );
    sj_flowerMesh.count = sj_flowers.length;
    sj_pads.forEach((sj_p, sj_i) => {
      sj_q.setFromAxisAngle(sj_Y, sj_p.rot);
      sj_m4.compose(
        sj_v3.set(sj_p.x, sj_WATER_LEVEL + 0.015, sj_p.z),
        sj_q,
        sj_s3.setScalar(sj_p.s),
      );
      sj_padMesh.setMatrixAt(sj_i, sj_m4);
    });
    sj_flowers.forEach((sj_p, sj_i) => {
      sj_q.setFromAxisAngle(sj_Y, sj_p.rot * 1.7);
      sj_m4.compose(
        sj_v3.set(sj_p.x + 0.08 * sj_p.s, sj_WATER_LEVEL + 0.03, sj_p.z),
        sj_q,
        sj_s3.setScalar(sj_p.s * 1.15),
      );
      sj_flowerMesh.setMatrixAt(sj_i, sj_m4);
    });
    for (const sj_m of [sj_padMesh, sj_flowerMesh]) {
      sj_m.instanceMatrix.needsUpdate = true;
      sj_m.computeBoundingSphere();
      sj_m.receiveShadow = true;
      sj_m.castShadow = false;
      this.group.add(sj_m);
    }
    sj_padMesh.name = 'lily-pads';
    sj_flowerMesh.name = 'lotus-flowers';
  }

  addTo(sj_scene: Scene): void {
    sj_scene.add(this.group);
  }
}
