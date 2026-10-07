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
import { sj_PAL } from './parts';
import { createBannerAtlas, type BannerSpec } from './textures';
import { sj_globalUniforms } from '../../render/uniforms';
import { sj_WIND_GLSL } from '../../render/glsl';
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

/** Point and tangent at arc length `sj_s` along a polyline. */
function sampleAt(sj_points: readonly Vec2[], sj_s: number): { p: Vector3; dir: Vector3 } {
  let sj_acc = 0;
  for (let sj_i = 0; sj_i < sj_points.length - 1; sj_i++) {
    const sj_a = sj_points[sj_i]!;
    const sj_b = sj_points[sj_i + 1]!;
    const sj_len = Math.hypot(sj_b[0] - sj_a[0], sj_b[1] - sj_a[1]);
    if (sj_acc + sj_len >= sj_s || sj_i === sj_points.length - 2) {
      const sj_t = Math.min(1, Math.max(0, (sj_s - sj_acc) / sj_len));
      return {
        p: new Vector3(
          sj_a[0] + (sj_b[0] - sj_a[0]) * sj_t,
          0,
          sj_a[1] + (sj_b[1] - sj_a[1]) * sj_t,
        ),
        dir: new Vector3(sj_b[0] - sj_a[0], 0, sj_b[1] - sj_a[1]).normalize(),
      };
    }
    sj_acc += sj_len;
  }
  return { p: new Vector3(), dir: new Vector3(0, 0, 1) };
}

function pathLength(sj_points: readonly Vec2[]): number {
  let sj_acc = 0;
  for (let sj_i = 0; sj_i < sj_points.length - 1; sj_i++) {
    sj_acc += Math.hypot(
      sj_points[sj_i + 1]![0] - sj_points[sj_i]![0],
      sj_points[sj_i + 1]![1] - sj_points[sj_i]![1],
    );
  }
  return sj_acc;
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
    sj_b: ArchBuilder,
    sj_col: CollisionWorld,
    sj_path: readonly Vec2[],
    sj_ground: (sj_x: number, sj_z: number) => number,
    sj_specs: BannerSpec[],
    sj_textScale = 1,
  ) {
    const sj_n = Math.max(1, sj_specs.length);
    const sj_total = pathLength(sj_path);
    const sj_cloths: BufferGeometry[] = [];
    sj_specs.forEach((_sj, sj_i) => {
      const sj_s = sj_total * (0.2 + (0.66 * (sj_i + 0.5)) / sj_n);
      const { p: sj_p, dir: sj_dir } = sampleAt(sj_path, sj_s);
      const sj_side = sj_i % 2 === 0 ? 1 : -1;
      const sj_normal = new Vector3(sj_dir.z, 0, -sj_dir.x).multiplyScalar(sj_side); // points away from path
      const sj_poleX = sj_p.x + sj_normal.x * 2.55;
      const sj_poleZ = sj_p.z + sj_normal.z * 2.55;
      const sj_y = sj_ground(sj_poleX, sj_poleZ);
      const sj_poleH = 5.6;
      // banner faces down the path, towards visitors walking up it
      const sj_yaw = Math.atan2(-sj_dir.x, -sj_dir.z);
      sj_b.add('paint', post(0.09, sj_poleH, 8), sj_PAL.wood, T(sj_poleX, sj_y, sj_poleZ));
      sj_b.add('paint', post(0.18, 0.4, 8, 0.12), sj_PAL.stoneDark, T(sj_poleX, sj_y, sj_poleZ));
      sj_b.add('paint', post(0.06, 0.3, 6), sj_PAL.gold, T(sj_poleX, sj_y + sj_poleH, sj_poleZ));
      // crossbar reaching over the path edge
      const sj_armLen = 1.55;
      const sj_mid = new Vector3(
        sj_poleX - sj_normal.x * sj_armLen * 0.5,
        sj_y + sj_poleH - 0.25,
        sj_poleZ - sj_normal.z * sj_armLen * 0.5,
      );
      sj_b.add(
        'paint',
        box(0.08, 0.08, sj_armLen),
        sj_PAL.wood,
        T(sj_mid.x, sj_mid.y, sj_mid.z, 0, Math.atan2(sj_normal.x, sj_normal.z)),
      );
      sj_col.circle(sj_poleX, sj_poleZ, 0.2, sj_y, sj_y + sj_poleH, 'banner-pole');

      // cloth: 1.3 x 3.55 m, top edge under the crossbar, UVs into the atlas column
      const sj_cloth = new PlaneGeometry(1.3, 3.55, 4, 16);
      sj_cloth.translate(0, -1.775, 0);
      const sj_uv = sj_cloth.attributes.uv as BufferAttribute;
      const sj_hang = new Float32Array(sj_uv.count);
      const sj_pos = sj_cloth.attributes.position as BufferAttribute;
      for (let sj_k = 0; sj_k < sj_uv.count; sj_k++) {
        sj_uv.setX(sj_k, (sj_i + sj_uv.getX(sj_k)) / sj_n);
        sj_hang[sj_k] = -sj_pos.getY(sj_k) / 3.55;
      }
      sj_cloth.setAttribute('aHang', new BufferAttribute(sj_hang, 1));
      const sj_cx = sj_poleX - sj_normal.x * sj_armLen * 0.72;
      const sj_cz = sj_poleZ - sj_normal.z * sj_armLen * 0.72;
      sj_cloth.applyMatrix4(T(sj_cx, sj_y + sj_poleH - 0.32, sj_cz, 0, sj_yaw));
      sj_cloths.push(sj_cloth);

      // altar with a glowing scroll, on the path side of the pole
      const sj_ax = sj_p.x + sj_normal.x * 1.55;
      const sj_az = sj_p.z + sj_normal.z * 1.55;
      const sj_ay = sj_ground(sj_ax, sj_az);
      const sj_am = T(sj_ax, sj_ay, sj_az, 0, sj_yaw);
      sj_b.add('paint', box(0.9, 0.75, 0.6).translate(0, 0.375, 0), sj_PAL.stone, sj_am);
      sj_b.add('paint', box(1.0, 0.08, 0.7), sj_PAL.stoneDark, mul(sj_am, T(0, 0.79, 0)));
      sj_b.add(
        'glow',
        post(0.07, 0.62, 10)
          .rotateZ(Math.PI / 2)
          .translate(0.31, 0.9, 0),
        '#f5deb0',
        sj_am,
      );
      sj_b.add(
        'paint',
        post(0.08, 0.06, 10)
          .rotateZ(Math.PI / 2)
          .translate(0.37, 0.9, 0),
        sj_PAL.wood,
        sj_am,
      );
      sj_b.add(
        'paint',
        post(0.08, 0.06, 10)
          .rotateZ(Math.PI / 2)
          .translate(-0.31, 0.9, 0),
        sj_PAL.wood,
        sj_am,
      );
      sj_b.light({ x: sj_ax, y: sj_ay + 0.9, z: sj_az, size: 0.3, kind: 'altar' });
      sj_col.box(sj_ax, sj_az, 0.48, 0.32, sj_yaw, sj_ay, sj_ay + 0.9, `banner:${sj_i}`);
      this.anchors.push({ x: sj_ax, y: sj_ay + 0.9, z: sj_az, yaw: sj_yaw, index: sj_i });
    });

    const sj_merged = sj_cloths.length
      ? mergeGeometries(sj_cloths, false)!
      : new PlaneGeometry(0.01, 0.01);
    sj_cloths.forEach((sj_c) => sj_c.dispose());
    const sj_material = new MeshStandardMaterial({
      map: createBannerAtlas(sj_specs, sj_textScale),
      side: DoubleSide,
      roughness: 0.85,
      alphaTest: 0.5,
    });
    sj_material.onBeforeCompile = (sj_shader) => {
      Object.assign(sj_shader.uniforms, {
        uTime: sj_globalUniforms.uTime,
        uWindDir: sj_globalUniforms.uWindDir,
        uWindStrength: sj_globalUniforms.uWindStrength,
      });
      sj_shader.vertexShader = sj_shader.vertexShader
        .replace('#include <common>', `#include <common>\nattribute float aHang;\n${sj_WIND_GLSL}`)
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
    sj_material.customProgramCacheKey = () => 'banner-cloth';
    this.mesh = new Mesh(sj_merged, sj_material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'banners';
  }

  addTo(sj_scene: Scene): void {
    sj_scene.add(this.mesh);
  }
}
