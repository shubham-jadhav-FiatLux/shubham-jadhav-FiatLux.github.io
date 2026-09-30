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
import { globalUniforms } from '../../render/uniforms';
import { NOISE_GLSL } from '../../render/glsl';
import { WATER_LEVEL } from '../layout';

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

const MARGIN = 1.3;

/**
 * Foam hugging every post and pier that stands in the lake, broken up by drifting noise,
 * with faint ripple rings spreading from it. One quad per pier, all in one draw call; the
 * fragment shader measures the distance to the pier's footprint.
 */
export class PierFoam {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;

  constructor(piers: readonly PierShape[]) {
    const n = piers.length;
    const pos = new Float32Array(n * 4 * 3);
    const local = new Float32Array(n * 4 * 2);
    const shape = new Float32Array(n * 4 * 4);
    const index: number[] = [];
    piers.forEach((p, i) => {
      const cs = Math.cos(p.rot);
      const sn = Math.sin(p.rot);
      const ex = p.hx + MARGIN;
      const ez = p.hz + MARGIN;
      [
        [-ex, -ez],
        [ex, -ez],
        [ex, ez],
        [-ex, ez],
      ].forEach(([lx, lz], k) => {
        const v = i * 4 + k;
        pos[v * 3] = p.x + lx! * cs + lz! * sn;
        pos[v * 3 + 1] = WATER_LEVEL + 0.012;
        pos[v * 3 + 2] = p.z - lx! * sn + lz! * cs;
        local[v * 2] = lx!;
        local[v * 2 + 1] = lz!;
        shape.set([p.hx, p.hz, p.round, i * 0.37], v * 4);
      });
      const b = i * 4;
      index.push(b, b + 2, b + 1, b, b + 3, b + 2);
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aLocal', new BufferAttribute(local, 2));
    geo.setAttribute('aShape', new BufferAttribute(shape, 4));
    geo.setIndex(index);
    geo.computeBoundingSphere();

    const material = new ShaderMaterial({
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
        ${NOISE_GLSL}
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
          foam *= 1.0 - smoothstep(${(MARGIN - 0.25).toFixed(2)}, ${MARGIN.toFixed(2)}, d);
          if (foam < 0.01) discard;
          gl_FragColor = vec4(uFoam, foam * 0.8);
          #include <fog_fragment>
        }
      `,
    });
    material.uniforms.uTime = globalUniforms.uTime;
    this.mesh = new Mesh(geo, material);
    this.mesh.name = 'pier-foam';
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = n > 0;
  }

  addTo(scene: Scene): void {
    if (this.mesh.geometry.attributes.position!.count) scene.add(this.mesh);
  }
}
