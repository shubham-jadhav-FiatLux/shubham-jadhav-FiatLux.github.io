import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  type Scene,
} from 'three';
import { sj_globalUniforms } from '../../render/uniforms';
import { sj_NOISE_GLSL } from '../../render/glsl';
import { sj_WATER_LEVEL } from '../layout';

/** Footprint of something standing in the lake: a rounded box around (x, z). */
export interface PierShape {
  x: number;
  z: number;
  hx: number;
  hz: number;
  /** corner radius (a round post has round = hx = hz) */
  round: number;
  /** yaw, same convention as Object3D.rotation.y */
  rot: number;
}

const sj_MARGIN = 1.3;

/**
 * Foam hugging every post and pier that stands in the lake, broken up by drifting noise,
 * with faint ripple rings spreading from it. One quad per pier, all in one draw call; the
 * fragment shader measures the distance to the pier's footprint.
 */
export class PierFoam {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;

  constructor(sj_piers: readonly PierShape[]) {
    const sj_n = sj_piers.length;
    const sj_pos = new Float32Array(sj_n * 4 * 3);
    const sj_local = new Float32Array(sj_n * 4 * 2);
    const sj_shape = new Float32Array(sj_n * 4 * 4);
    const sj_index: number[] = [];
    sj_piers.forEach((sj_p, sj_i) => {
      const sj_cs = Math.cos(sj_p.rot);
      const sj_sn = Math.sin(sj_p.rot);
      const sj_ex = sj_p.hx + sj_MARGIN;
      const sj_ez = sj_p.hz + sj_MARGIN;
      [
        [-sj_ex, -sj_ez],
        [sj_ex, -sj_ez],
        [sj_ex, sj_ez],
        [-sj_ex, sj_ez],
      ].forEach(([sj_lx, sj_lz], sj_k) => {
        const sj_v = sj_i * 4 + sj_k;
        sj_pos[sj_v * 3] = sj_p.x + sj_lx! * sj_cs + sj_lz! * sj_sn;
        sj_pos[sj_v * 3 + 1] = sj_WATER_LEVEL + 0.012;
        sj_pos[sj_v * 3 + 2] = sj_p.z - sj_lx! * sj_sn + sj_lz! * sj_cs;
        sj_local[sj_v * 2] = sj_lx!;
        sj_local[sj_v * 2 + 1] = sj_lz!;
        sj_shape.set([sj_p.hx, sj_p.hz, sj_p.round, sj_i * 0.37], sj_v * 4);
      });
      const sj_b = sj_i * 4;
      sj_index.push(sj_b, sj_b + 2, sj_b + 1, sj_b, sj_b + 3, sj_b + 2);
    });
    const sj_geo = new BufferGeometry();
    sj_geo.setAttribute('position', new BufferAttribute(sj_pos, 3));
    sj_geo.setAttribute('aLocal', new BufferAttribute(sj_local, 2));
    sj_geo.setAttribute('aShape', new BufferAttribute(sj_shape, 4));
    sj_geo.setIndex(sj_index);
    sj_geo.computeBoundingSphere();

    const sj_material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: UniformsUtils.merge([UniformsLib.fog, { uFoam: { value: new Color('#f4f1e6') } }]),
      vertexShader: /* glsl */ `
        attribute vec2 aLocal;
        attribute vec4 aShape;
        varying vec2 vLocal;
        varying vec4 vShape;
        varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main() {
          vLocal = aLocal;
          vShape = aShape;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uFoam;
        varying vec2 vLocal;
        varying vec4 vShape;
        varying vec3 vWorld;
        ${sj_NOISE_GLSL}
        #include <fog_pars_fragment>
        float sdRoundBox(vec2 p, vec2 b, float r) {
          vec2 q = abs(p) - b + r;
          return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
        }
        void main() {
          float d = sdRoundBox(vLocal, vShape.xy, vShape.z);
          if (d < -0.03) discard;
          float t = uTime;
          float n = vnoise(vWorld.xz * 3.2 + vec2(t * 0.22, -t * 0.17) + vShape.w * 7.0);
          float n2 = vnoise(vWorld.xz * 8.0 - vec2(t * 0.35, t * 0.28));
          float hug = 1.0 - smoothstep(0.0, 0.12 + 0.24 * n, d);
          float rings = smoothstep(0.6, 0.95, sin(d * 15.0 - t * 2.1 + vShape.w * 6.0) * 0.5 + 0.5);
          rings *= (1.0 - smoothstep(0.1, 1.1, d)) * smoothstep(0.35, 0.65, n) * 0.4;
          float foam = clamp(hug * (0.55 + 0.6 * n2) + rings, 0.0, 1.0);
          foam *= 1.0 - smoothstep(${(sj_MARGIN - 0.25).toFixed(2)}, ${sj_MARGIN.toFixed(2)}, d);
          if (foam < 0.01) discard;
          gl_FragColor = vec4(uFoam, foam * 0.8);
          #include <fog_fragment>
        }
      `,
    });
    sj_material.uniforms.uTime = sj_globalUniforms.uTime;
    this.mesh = new Mesh(sj_geo, sj_material);
    this.mesh.name = 'pier-foam';
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = sj_n > 0;
  }

  addTo(sj_scene: Scene): void {
    if (this.mesh.geometry.attributes.position!.count) sj_scene.add(this.mesh);
  }
}
