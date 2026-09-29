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
import { globalUniforms } from '../../render/uniforms';
import { WATER_LEVEL } from '../layout';

function padGeometry(): BufferGeometry {
  // A round leaf with a notch, edges curling up slightly.
  const g = new CircleGeometry(0.5, 22, 0.35, Math.PI * 2 - 0.35);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const inner = new Color('#5d8f3a');
  const outer = new Color('#3f6f2c');
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i)) / 0.5;
    pos.setY(i, r * r * 0.04);
    c.copy(inner).lerp(outer, r);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

function flowerGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const base = new Color('#fdf1f4');
  const tip = new Color('#ef7fa6');
  const ring = (count: number, length: number, tilt: number, lift: number, offset: number) => {
    for (let i = 0; i < count; i++) {
      const petal = new SphereGeometry(0.1, 8, 6);
      petal.scale(0.45, 1, 0.22);
      petal.translate(0, 0.1, 0);
      petal.scale(1, length, 1);
      const pos = petal.attributes.position as BufferAttribute;
      const colors = new Float32Array(pos.count * 3);
      const c = new Color();
      for (let k = 0; k < pos.count; k++) {
        const t = Math.min(1, Math.max(0, pos.getY(k) / (0.2 * length)));
        c.copy(base).lerp(tip, Math.pow(t, 1.6));
        colors.set([c.r, c.g, c.b], k * 3);
      }
      petal.setAttribute('color', new BufferAttribute(colors, 3));
      petal.rotateX(tilt);
      petal.rotateY((i / count) * Math.PI * 2 + offset);
      petal.translate(0, lift, 0);
      petal.deleteAttribute('uv');
      parts.push(petal.toNonIndexed());
    }
  };
  ring(8, 1.25, 0.95, 0.02, 0);
  ring(7, 1.1, 0.55, 0.04, 0.4);
  ring(5, 0.9, 0.25, 0.06, 0.9);
  const centre = new SphereGeometry(0.05, 8, 6);
  centre.scale(1, 0.5, 1);
  centre.translate(0, 0.08, 0);
  const cc = new Float32Array(centre.attributes.position!.count * 3);
  const yellow = new Color('#f2c94c');
  for (let k = 0; k < cc.length; k += 3) cc.set([yellow.r, yellow.g, yellow.b], k);
  centre.setAttribute('color', new BufferAttribute(cc, 3));
  centre.deleteAttribute('uv');
  parts.push(centre.toNonIndexed());
  const merged = mergeGeometries(parts, false)!;
  merged.computeVertexNormals();
  return merged;
}

const m4 = new Matrix4();
const q = new Quaternion();
const v3 = new Vector3();
const s3 = new Vector3();
const Y = new Vector3(0, 1, 0);

/** Lily pads drifting in the shallows, some carrying pink lotus flowers. They bob gently. */
export class Lotus {
  readonly group = new Group();

  constructor(pads: { x: number; z: number; s: number; rot: number; flower: boolean }[]) {
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.55,
      side: DoubleSide,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = globalUniforms.uTime;
      shader.vertexShader = shader.vertexShader
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
    const padMesh = new InstancedMesh(padGeometry(), material, pads.length);
    const flowers = pads.filter((p) => p.flower);
    const flowerMesh = new InstancedMesh(flowerGeometry(), material, Math.max(1, flowers.length));
    flowerMesh.count = flowers.length;
    pads.forEach((p, i) => {
      q.setFromAxisAngle(Y, p.rot);
      m4.compose(v3.set(p.x, WATER_LEVEL + 0.015, p.z), q, s3.setScalar(p.s));
      padMesh.setMatrixAt(i, m4);
    });
    flowers.forEach((p, i) => {
      q.setFromAxisAngle(Y, p.rot * 1.7);
      m4.compose(v3.set(p.x + 0.08 * p.s, WATER_LEVEL + 0.03, p.z), q, s3.setScalar(p.s * 1.15));
      flowerMesh.setMatrixAt(i, m4);
    });
    for (const m of [padMesh, flowerMesh]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      m.receiveShadow = true;
      m.castShadow = false;
      this.group.add(m);
    }
    padMesh.name = 'lily-pads';
    flowerMesh.name = 'lotus-flowers';
  }

  addTo(scene: Scene): void {
    scene.add(this.group);
  }
}
