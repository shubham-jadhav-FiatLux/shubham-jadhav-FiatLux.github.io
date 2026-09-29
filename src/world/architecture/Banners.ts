import {
  BufferAttribute,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
  type BufferGeometry,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { T, mul, type ArchBuilder } from './Builder';
import { box, post } from './geometry';
import { PAL } from './parts';
import { createBannerAtlas, type BannerSpec } from './textures';
import { globalUniforms } from '../../render/uniforms';
import { WIND_GLSL } from '../../render/glsl';
import type { CollisionWorld } from '../../physics/CollisionWorld';
import type { Vec2 } from '../layout';

export interface BannerAnchor {
  /** interaction point in front of the altar */
  x: number;
  y: number;
  z: number;
  /** direction the banner faces (towards visitors coming up the path) */
  yaw: number;
  index: number;
}

/** Point and tangent at arc length `s` along a polyline. */
function sampleAt(points: readonly Vec2[], s: number): { p: Vector3; dir: Vector3 } {
  let acc = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + len >= s || i === points.length - 2) {
      const t = Math.min(1, Math.max(0, (s - acc) / len));
      return {
        p: new Vector3(a[0] + (b[0] - a[0]) * t, 0, a[1] + (b[1] - a[1]) * t),
        dir: new Vector3(b[0] - a[0], 0, b[1] - a[1]).normalize(),
      };
    }
    acc += len;
  }
  return { p: new Vector3(), dir: new Vector3(0, 0, 1) };
}

function pathLength(points: readonly Vec2[]): number {
  let acc = 0;
  for (let i = 0; i < points.length - 1; i++) {
    acc += Math.hypot(points[i + 1]![0] - points[i]![0], points[i + 1]![1] - points[i]![1]);
  }
  return acc;
}

/**
 * Project banners lining the path up to the pagoda: tall poles with cloth banners that
 * flutter in the wind (vertex shader), each with a small altar holding a glowing scroll.
 * All cloths share one texture atlas and one draw call.
 */
export class Banners {
  readonly mesh: Mesh;
  readonly anchors: BannerAnchor[] = [];

  constructor(
    b: ArchBuilder,
    col: CollisionWorld,
    path: readonly Vec2[],
    ground: (x: number, z: number) => number,
    specs: BannerSpec[],
  ) {
    const n = Math.max(1, specs.length);
    const total = pathLength(path);
    const cloths: BufferGeometry[] = [];
    specs.forEach((_, i) => {
      const s = total * (0.2 + (0.66 * (i + 0.5)) / n);
      const { p, dir } = sampleAt(path, s);
      const side = i % 2 === 0 ? 1 : -1;
      const normal = new Vector3(dir.z, 0, -dir.x).multiplyScalar(side); // points away from path
      const poleX = p.x + normal.x * 2.55;
      const poleZ = p.z + normal.z * 2.55;
      const y = ground(poleX, poleZ);
      const poleH = 5.0;
      // banner faces down the path, towards visitors walking up it
      const yaw = Math.atan2(-dir.x, -dir.z);
      b.add('paint', post(0.09, poleH, 8), PAL.wood, T(poleX, y, poleZ));
      b.add('paint', post(0.18, 0.4, 8, 0.12), PAL.stoneDark, T(poleX, y, poleZ));
      b.add('paint', post(0.06, 0.3, 6), PAL.gold, T(poleX, y + poleH, poleZ));
      // crossbar reaching over the path edge
      const armLen = 1.35;
      const mid = new Vector3(
        poleX - normal.x * armLen * 0.5,
        y + poleH - 0.25,
        poleZ - normal.z * armLen * 0.5,
      );
      b.add(
        'paint',
        box(0.08, 0.08, armLen),
        PAL.wood,
        T(mid.x, mid.y, mid.z, 0, Math.atan2(normal.x, normal.z)),
      );
      col.circle(poleX, poleZ, 0.2, y, y + poleH, 'banner-pole');

      // cloth: 1.1 x 3 m, top edge under the crossbar, UVs into the atlas column
      const cloth = new PlaneGeometry(1.1, 3.0, 4, 16);
      cloth.translate(0, -1.5, 0);
      const uv = cloth.attributes.uv as BufferAttribute;
      const hang = new Float32Array(uv.count);
      const pos = cloth.attributes.position as BufferAttribute;
      for (let k = 0; k < uv.count; k++) {
        uv.setX(k, (i + uv.getX(k)) / n);
        hang[k] = -pos.getY(k) / 3.0;
      }
      cloth.setAttribute('aHang', new BufferAttribute(hang, 1));
      const cx = poleX - normal.x * armLen * 0.72;
      const cz = poleZ - normal.z * armLen * 0.72;
      cloth.applyMatrix4(T(cx, y + poleH - 0.32, cz, 0, yaw));
      cloths.push(cloth);

      // altar with a glowing scroll, on the path side of the pole
      const ax = p.x + normal.x * 1.55;
      const az = p.z + normal.z * 1.55;
      const ay = ground(ax, az);
      const am = T(ax, ay, az, 0, yaw);
      b.add('paint', box(0.9, 0.75, 0.6).translate(0, 0.375, 0), PAL.stone, am);
      b.add('paint', box(1.0, 0.08, 0.7), PAL.stoneDark, mul(am, T(0, 0.79, 0)));
      b.add(
        'glow',
        post(0.07, 0.62, 10)
          .rotateZ(Math.PI / 2)
          .translate(0.31, 0.9, 0),
        '#f5deb0',
        am,
      );
      b.add(
        'paint',
        post(0.08, 0.06, 10)
          .rotateZ(Math.PI / 2)
          .translate(0.37, 0.9, 0),
        PAL.wood,
        am,
      );
      b.add(
        'paint',
        post(0.08, 0.06, 10)
          .rotateZ(Math.PI / 2)
          .translate(-0.31, 0.9, 0),
        PAL.wood,
        am,
      );
      col.box(ax, az, 0.48, 0.32, yaw, ay, ay + 0.9, `banner:${i}`);
      this.anchors.push({ x: ax, y: ay + 0.9, z: az, yaw, index: i });
    });

    const merged = cloths.length ? mergeGeometries(cloths, false)! : new PlaneGeometry(0.01, 0.01);
    cloths.forEach((c) => c.dispose());
    const material = new MeshStandardMaterial({
      map: createBannerAtlas(specs),
      side: DoubleSide,
      roughness: 0.85,
      alphaTest: 0.5,
    });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uTime: globalUniforms.uTime,
        uWindDir: globalUniforms.uWindDir,
        uWindStrength: globalUniforms.uWindStrength,
      });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nattribute float aHang;\n${WIND_GLSL}`)
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          {
            float h = pow(aHang, 1.3);
            float wave = sin(uTime * 3.1 - aHang * 5.0 + position.x * 2.3 + transformed.x * 0.2) * 0.11
                       + sin(uTime * 5.3 - aHang * 9.0 + transformed.z * 0.3) * 0.04;
            vec2 w = windSway(transformed.xz, transformed.x) * 0.22;
            transformed += normal * wave * h;
            transformed.xz += w * h;
          }`,
        );
    };
    material.customProgramCacheKey = () => 'banner-cloth';
    this.mesh = new Mesh(merged, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'banners';
  }

  addTo(scene: Scene): void {
    scene.add(this.mesh);
  }
}
