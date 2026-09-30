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
import { FALLS, WATER_LEVEL } from '../layout';
import { FALLS_TOP, riverCourse } from '../heightfield';
import type { Particles } from '../../effects/Particles';
import { SPRITE } from '../../effects/Particles';

const MIST = new Color('#f2f6f3');
const SPRAY = new Color('#ffffff');
const GRAVITY = 9.81;

/**
 * The waterfall. The stream leaves the lip of the plateau and follows a ballistic arc
 * down the alcove into the plunge pool: a glassy sheet that turns white as it falls, a
 * wider veil of spray around it, churning foam where it lands, and mist rising from the
 * pool. The sheet starts on the stream's own surface so the two read as one body of water.
 */
export class Waterfall {
  readonly group: Mesh[] = [];
  /** top of the fall (the lip) and where it lands (used for sound and effects) */
  readonly top = new Vector3();
  readonly bottom = new Vector3();
  private mistTimer = 0;
  private sprayTimer = 0;

  constructor() {
    const pts = riverCourse.points;
    const lip = pts[pts.length - 1]!;
    const out = new Vector3(FALLS.dir.x, 0, FALLS.dir.z);
    const side = new Vector3(FALLS.across.x, 0, FALLS.across.z);
    this.top.set(lip.x, FALLS_TOP, lip.z);
    this.bottom.set(FALLS.foot.x, WATER_LEVEL, FALLS.foot.z);

    // Path: along the last metres of the stream, over the lip, then free fall.
    const path: Vector3[] = [];
    for (const back of [2.4, 1.6, 0.8]) {
      path.push(this.top.clone().addScaledVector(out, -back));
    }
    const height = FALLS_TOP - WATER_LEVEL;
    const fallTime = Math.sqrt((2 * height) / GRAVITY);
    const reach = Math.hypot(FALLS.foot.x - lip.x, FALLS.foot.z - lip.z);
    const vOut = reach / fallTime;
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
      // denser near the top where the curve bends most
      const t = fallTime * Math.pow(i / steps, 1.4);
      const q = this.top.clone().addScaledVector(out, vOut * t);
      q.y = FALLS_TOP - 0.5 * GRAVITY * t * t;
      path.push(q);
    }
    path[path.length - 1]!.y = WATER_LEVEL - 0.05;

    const width = (lip.halfWidth + 0.15) * 2;
    this.group.push(this.makeSheet(path, side, width, width * 1.25, false));
    this.group.push(
      this.makeSheet(
        path.map((q, i) => q.clone().addScaledVector(out, 0.18 + (0.6 * i) / path.length)),
        side,
        width * 1.25,
        width * 1.7,
        true,
      ),
    );
    this.group.push(this.makeChurn(this.bottom));
  }

  private makeSheet(
    path: Vector3[],
    side: Vector3,
    widthTop: number,
    widthBottom: number,
    veil: boolean,
  ): Mesh {
    const pos: number[] = [];
    const uv: number[] = [];
    const fall: number[] = [];
    const idx: number[] = [];
    let len = 0;
    const lens = [0];
    for (let i = 1; i < path.length; i++) {
      len += path[i]!.distanceTo(path[i - 1]!);
      lens.push(len);
    }
    const drop = path[0]!.y - path[path.length - 1]!.y;
    path.forEach((q, i) => {
      // 0 while still on the stream, then 0..1 down the fall
      const f = Math.max(0, Math.min(1, (FALLS_TOP - q.y) / drop));
      const w = widthTop + (widthBottom - widthTop) * Math.pow(f, 0.8);
      pos.push(q.x - side.x * w * 0.5, q.y, q.z - side.z * w * 0.5);
      pos.push(q.x + side.x * w * 0.5, q.y, q.z + side.z * w * 0.5);
      uv.push(0, lens[i]!, 1, lens[i]!);
      fall.push(f, f);
      if (i < path.length - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    geo.setAttribute('aFall', new BufferAttribute(new Float32Array(fall), 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      fog: true,
      defines: veil ? { VEIL: '' } : {},
      uniforms: UniformsUtils.merge([UniformsLib.fog, { uSeed: { value: veil ? 7.3 : 0 } }]),
      vertexShader: /* glsl */ `
        attribute float aFall;
        varying vec2 vUv;
        varying float vFall;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          vFall = aFall;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uSeed;
        uniform vec3 uSunDir;
        varying vec2 vUv;
        varying float vFall;
        ${NOISE_GLSL}
        #include <fog_pars_fragment>
        void main() {
          float x = vUv.x;
          float f = vFall;
          // every strand of water falls at its own pace
          float lane = vnoise(vec2(x * 13.0 + uSeed, 2.7));
          float flow = vUv.y - uTime * (4.2 + lane * 2.4);
          float streaks = fbm(vec2(x * 11.0 + uSeed, flow * 0.3));
          streaks = streaks * 0.65 + vnoise(vec2(x * 41.0 + uSeed, flow * 1.2)) * 0.35;
          // clumps of aerated water tumbling down
          float clumps = smoothstep(0.62, 0.8, vnoise(vec2(x * 7.0 + uSeed, flow * 0.55)));
          // ragged edges that fray further down
          float fray = vnoise(vec2(flow * 0.9, x * 4.0 + uSeed)) * (0.06 + 0.16 * f);
          float edge = smoothstep(0.0, 0.1 + fray, x) * smoothstep(1.0, 0.9 - fray, x);
          vec3 glass = vec3(0.42, 0.68, 0.7);
          vec3 white = vec3(1.0, 1.0, 0.97);
          #ifdef VEIL
            float a = smoothstep(0.1, 0.45, f) * (0.12 + 0.3 * smoothstep(0.35, 0.8, streaks + clumps * 0.4));
            vec3 col = white;
          #else
            float aer = smoothstep(0.0, 0.45, f);
            vec3 col = mix(glass, white, clamp(aer * 0.75 + smoothstep(0.45, 0.85, streaks) * 0.55 + clumps * 0.6, 0.0, 1.0));
            // the lip: smooth, glassy water curling over the edge
            col = mix(col, glass * 1.1 + 0.08, (1.0 - smoothstep(0.0, 0.08, f)) * 0.6);
            float a = mix(0.72, 0.94, aer) * (0.6 + 0.4 * smoothstep(0.25, 0.75, streaks)) + clumps * 0.2;
          #endif
          a *= edge;
          // melt into the churning pool at the bottom
          a *= 1.0 - smoothstep(0.93, 1.0, f);
          // warm sunlit sheen
          col += vec3(1.0, 0.86, 0.62) * 0.12 * smoothstep(0.5, 0.9, streaks);
          gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
          #include <fog_fragment>
        }
      `,
    });
    mat.uniforms.uTime = globalUniforms.uTime;
    mat.uniforms.uSunDir = globalUniforms.uSunDir;
    const mesh = new Mesh(geo, mat);
    mesh.name = veil ? 'waterfall-veil' : 'waterfall-sheet';
    mesh.renderOrder = veil ? 4 : 3;
    return mesh;
  }

  /** White water churning where the fall hits the pool. */
  private makeChurn(at: Vector3): Mesh {
    const radius = 3.2;
    const geo = new CircleGeometry(radius, 48);
    geo.rotateX(-Math.PI / 2);
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: UniformsUtils.merge([UniformsLib.fog, { uRadius: { value: radius } }]),
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
        uniform float uRadius;
        varying vec2 vLocal;
        ${NOISE_GLSL}
        #include <fog_pars_fragment>
        void main() {
          float r = length(vLocal) / uRadius;
          vec2 dir = vLocal / max(length(vLocal), 1e-3);
          // foam boils up in the middle and is pushed outwards in rings
          float boil = fbm(vLocal * 1.8 + vec2(uTime * 0.9, -uTime * 0.7));
          float rings = fbm(vec2(r * 7.0 - uTime * 1.6, atan(dir.y, dir.x) * 1.5));
          float foam = smoothstep(0.35, 0.65, boil * 0.6 + rings * 0.55);
          float a = (1.0 - smoothstep(0.3, 1.0, r)) * foam;
          a = max(a, (1.0 - smoothstep(0.0, 0.45, r)) * 0.85);
          gl_FragColor = vec4(vec3(0.98, 0.99, 0.97), a * 0.9);
          #include <fog_fragment>
        }
      `,
    });
    mat.uniforms.uTime = globalUniforms.uTime;
    const mesh = new Mesh(geo, mat);
    mesh.position.set(at.x, WATER_LEVEL + 0.04, at.z);
    mesh.name = 'waterfall-churn';
    mesh.renderOrder = 2;
    return mesh;
  }

  addTo(scene: Scene): void {
    for (const m of this.group) scene.add(m);
  }

  /** Mist rising from the pool, spray thrown up where the water lands. */
  update(dt: number, particles: Particles, amount: number): void {
    const out = FALLS.dir;
    this.mistTimer += dt * 30 * amount;
    while (this.mistTimer > 1) {
      this.mistTimer -= 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 2.2;
      particles.spawn({
        x: this.bottom.x + Math.cos(a) * r,
        y: WATER_LEVEL + 0.3 + Math.random() * 0.8,
        z: this.bottom.z + Math.sin(a) * r,
        vx: Math.cos(a) * 0.5 + out.x * 0.9,
        vy: 0.7 + Math.random() * 1.5,
        vz: Math.sin(a) * 0.5 + out.z * 0.9,
        life: 2.2 + Math.random() * 1.8,
        size: 1.1,
        sizeEnd: 4.2,
        color: MIST,
        alpha: 0.26,
        drag: 0.35,
        sprite: SPRITE.puff,
      });
    }
    this.sprayTimer += dt * 40 * amount;
    while (this.sprayTimer > 1) {
      this.sprayTimer -= 1;
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 2.5;
      particles.spawn({
        x: this.bottom.x + Math.cos(a) * 0.8,
        y: WATER_LEVEL + 0.1,
        z: this.bottom.z + Math.sin(a) * 0.8,
        vx: Math.cos(a) * s * 0.6,
        vy: 2.5 + Math.random() * 2.5,
        vz: Math.sin(a) * s * 0.6,
        life: 0.7 + Math.random() * 0.5,
        size: 0.12,
        sizeEnd: 0.05,
        color: SPRAY,
        alpha: 0.8,
        gravity: 9,
        drag: 0.4,
        sprite: SPRITE.drop,
      });
    }
  }
}
