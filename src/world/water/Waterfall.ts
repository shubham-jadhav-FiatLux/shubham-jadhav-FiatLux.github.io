import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  type Scene,
} from 'three';
import { globalUniforms } from '../../render/uniforms';
import { NOISE_GLSL } from '../../render/glsl';
import { WATER_LEVEL } from '../layout';
import type { Terrain } from '../Terrain';
import type { Particles } from '../../effects/Particles';
import { SPRITE } from '../../effects/Particles';

const MIST = new Color('#f4f7f4');

/**
 * The waterfall: a curved ribbon of scrolling streaks pouring off the escarpment lip into
 * the lake, a churning foam pool at its foot and a constant plume of mist.
 */
export class Waterfall {
  readonly group: Mesh[] = [];
  readonly top = new Vector3();
  readonly bottom = new Vector3();
  private mistTimer = 0;

  constructor(terrain: Terrain, from: { x: number; z: number }, towards: { x: number; z: number }) {
    // March from the pool towards the cliff to find the lip of the escarpment.
    const dir = new Vector3(towards.x - from.x, 0, towards.z - from.z).normalize();
    const p = new Vector3(from.x, 0, from.z);
    let lip = p.clone();
    let foot = p.clone();
    let foundFoot = false;
    for (let i = 0; i < 80; i++) {
      p.addScaledVector(dir, 0.25);
      const h = terrain.heightAt(p.x, p.z);
      if (!foundFoot && h > WATER_LEVEL + 0.4) {
        foot = p.clone().addScaledVector(dir, -0.6);
        foundFoot = true;
      }
      if (h > 10) {
        lip = p.clone();
        break;
      }
    }
    lip.y = terrain.heightAt(lip.x, lip.z) + 0.15;
    const back = lip.clone().addScaledVector(dir, 2.2);
    back.y = terrain.heightAt(back.x, back.z) + 0.15;
    foot.y = WATER_LEVEL;
    this.top.copy(lip);
    this.bottom.copy(foot).addScaledVector(dir, -1.2);
    this.bottom.y = WATER_LEVEL;

    // Path of the falling sheet: over the lip, then a slight outward arc down to the pool.
    const path: Vector3[] = [];
    const out = dir.clone().negate();
    const fallHeight = lip.y - WATER_LEVEL;
    path.push(back);
    path.push(lip.clone().addScaledVector(dir, 0.8));
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const q = lip.clone().addScaledVector(out, 0.25 + Math.sqrt(t) * 2.6);
      q.y = lip.y - fallHeight * t * t * 0.3 - fallHeight * t * 0.7;
      path.push(q);
    }
    const width = 3.4;
    const side = new Vector3(-dir.z, 0, dir.x);
    this.group.push(this.makeSheet(path, side, width, 1));
    this.group.push(
      this.makeSheet(
        path.map((q) => q.clone().addScaledVector(out, 0.25)),
        side,
        width * 1.25,
        0.45,
      ),
    );
    this.group.push(this.makePool(this.bottom));
  }

  private makeSheet(path: Vector3[], side: Vector3, width: number, opacity: number): Mesh {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let len = 0;
    const lens = [0];
    for (let i = 1; i < path.length; i++) {
      len += path[i]!.distanceTo(path[i - 1]!);
      lens.push(len);
    }
    path.forEach((q, i) => {
      // taper: narrower at the lip, spreading as it falls
      const w = width * (0.75 + 0.35 * (lens[i]! / len));
      pos.push(q.x - side.x * w * 0.5, q.y, q.z - side.z * w * 0.5);
      pos.push(q.x + side.x * w * 0.5, q.y, q.z + side.z * w * 0.5);
      uv.push(0, lens[i]!, 1, lens[i]!);
      if (i < path.length - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    geo.setIndex(idx);
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      fog: true,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        { uOpacity: { value: opacity }, uLength: { value: len } },
      ]),
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uOpacity;
        uniform float uLength;
        varying vec2 vUv;
        ${NOISE_GLSL}
        #include <fog_pars_fragment>
        void main() {
          float flow = vUv.y - uTime * 3.2;
          float streaks = fbm(vec2(vUv.x * 9.0, flow * 0.55));
          streaks += 0.5 * vnoise(vec2(vUv.x * 30.0, flow * 1.4));
          float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
          float t = vUv.y / uLength;
          vec3 col = mix(vec3(0.62, 0.84, 0.86), vec3(1.0), smoothstep(0.45, 0.95, streaks));
          col = mix(col, vec3(1.0), smoothstep(0.75, 1.0, t)); // white churn near the pool
          float a = (0.55 + 0.45 * smoothstep(0.35, 0.8, streaks)) * edge * uOpacity;
          a *= smoothstep(0.0, 0.06, t);
          gl_FragColor = vec4(col * 1.08, a);
          #include <fog_fragment>
        }
      `,
    });
    mat.uniforms.uTime = globalUniforms.uTime;
    const mesh = new Mesh(geo, mat);
    mesh.name = 'waterfall-sheet';
    mesh.renderOrder = 3;
    return mesh;
  }

  private makePool(at: Vector3): Mesh {
    const geo = new CircleGeometry(3.4, 40);
    geo.rotateX(-Math.PI / 2);
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: UniformsUtils.merge([UniformsLib.fog]),
      vertexShader: /* glsl */ `
        varying vec2 vLocal;
        #include <fog_pars_vertex>
        void main() {
          vLocal = position.xz;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vLocal;
        ${NOISE_GLSL}
        #include <fog_pars_fragment>
        void main() {
          float r = length(vLocal) / 3.4;
          float churn = fbm(vLocal * 1.6 + vec2(uTime * 0.8, -uTime * 0.6));
          float rings = 0.5 + 0.5 * sin(r * 22.0 - uTime * 5.0 + churn * 4.0);
          float a = (1.0 - smoothstep(0.35, 1.0, r)) * smoothstep(0.3, 0.7, churn * 0.7 + rings * 0.45);
          gl_FragColor = vec4(vec3(0.97, 0.98, 0.96), a * 0.85);
          #include <fog_fragment>
        }
      `,
    });
    mat.uniforms.uTime = globalUniforms.uTime;
    const mesh = new Mesh(geo, mat);
    mesh.position.set(at.x, WATER_LEVEL + 0.03, at.z);
    mesh.name = 'waterfall-pool';
    mesh.renderOrder = 2;
    return mesh;
  }

  addTo(scene: Scene): void {
    for (const m of this.group) scene.add(m);
  }

  /** Emits mist and spray at the foot of the falls. */
  update(dt: number, particles: Particles, amount: number): void {
    this.mistTimer += dt * 26 * amount;
    while (this.mistTimer > 1) {
      this.mistTimer -= 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.6;
      particles.spawn({
        x: this.bottom.x + Math.cos(a) * r,
        y: WATER_LEVEL + 0.2,
        z: this.bottom.z + Math.sin(a) * r,
        vx: Math.cos(a) * 0.8,
        vy: 0.8 + Math.random() * 1.6,
        vz: Math.sin(a) * 0.8,
        life: 1.8 + Math.random() * 1.4,
        size: 0.9,
        sizeEnd: 3.2,
        color: MIST,
        alpha: 0.32,
        drag: 0.4,
        sprite: SPRITE.puff,
      });
    }
  }
}
