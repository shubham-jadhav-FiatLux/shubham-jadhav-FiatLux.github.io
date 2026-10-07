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
import { sj_globalUniforms } from '../../render/uniforms';
import { sj_NOISE_GLSL } from '../../render/glsl';
import { sj_FALLS, sj_WATER_LEVEL } from '../layout';
import { sj_FALLS_TOP, sj_riverCourse } from '../heightfield';
import type { Particles } from '../../effects/Particles';
import { sj_SPRITE } from '../../effects/Particles';

const sj_MIST = new Color('#f2f6f3');
const sj_SPRAY = new Color('#ffffff');
const sj_GRAVITY = 9.81;

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
    const sj_pts = sj_riverCourse.points;
    const sj_lip = sj_pts[sj_pts.length - 1]!;
    const sj_out = new Vector3(sj_FALLS.dir.x, 0, sj_FALLS.dir.z);
    const sj_side = new Vector3(sj_FALLS.across.x, 0, sj_FALLS.across.z);
    this.top.set(sj_lip.x, sj_FALLS_TOP, sj_lip.z);
    this.bottom.set(sj_FALLS.foot.x, sj_WATER_LEVEL, sj_FALLS.foot.z);

    // Path: along the last metres of the stream, over the lip, then free fall.
    const sj_path: Vector3[] = [];
    for (const sj_back of [2.4, 1.6, 0.8]) {
      sj_path.push(this.top.clone().addScaledVector(sj_out, -sj_back));
    }
    const sj_height = sj_FALLS_TOP - sj_WATER_LEVEL;
    const sj_fallTime = Math.sqrt((2 * sj_height) / sj_GRAVITY);
    const sj_reach = Math.hypot(sj_FALLS.foot.x - sj_lip.x, sj_FALLS.foot.z - sj_lip.z);
    const sj_vOut = sj_reach / sj_fallTime;
    const sj_steps = 30;
    for (let sj_i = 0; sj_i <= sj_steps; sj_i++) {
      // denser near the top where the curve bends most
      const sj_t = sj_fallTime * Math.pow(sj_i / sj_steps, 1.4);
      const sj_q = this.top.clone().addScaledVector(sj_out, sj_vOut * sj_t);
      sj_q.y = sj_FALLS_TOP - 0.5 * sj_GRAVITY * sj_t * sj_t;
      sj_path.push(sj_q);
    }
    sj_path[sj_path.length - 1]!.y = sj_WATER_LEVEL - 0.05;

    const sj_width = (sj_lip.halfWidth + 0.15) * 2;
    this.group.push(this.makeSheet(sj_path, sj_side, sj_width, sj_width * 1.25, false));
    this.group.push(
      this.makeSheet(
        sj_path.map((sj_q, sj_i) =>
          sj_q.clone().addScaledVector(sj_out, 0.18 + (0.6 * sj_i) / sj_path.length),
        ),
        sj_side,
        sj_width * 1.25,
        sj_width * 1.7,
        true,
      ),
    );
    this.group.push(this.makeChurn(this.bottom));
  }

  private makeSheet(
    sj_path: Vector3[],
    sj_side: Vector3,
    sj_widthTop: number,
    sj_widthBottom: number,
    sj_veil: boolean,
  ): Mesh {
    const sj_pos: number[] = [];
    const sj_uv: number[] = [];
    const sj_fall: number[] = [];
    const sj_idx: number[] = [];
    let sj_len = 0;
    const sj_lens = [0];
    for (let sj_i = 1; sj_i < sj_path.length; sj_i++) {
      sj_len += sj_path[sj_i]!.distanceTo(sj_path[sj_i - 1]!);
      sj_lens.push(sj_len);
    }
    const sj_drop = sj_path[0]!.y - sj_path[sj_path.length - 1]!.y;
    sj_path.forEach((sj_q, sj_i) => {
      // 0 while still on the stream, then 0..1 down the fall
      const sj_f = Math.max(0, Math.min(1, (sj_FALLS_TOP - sj_q.y) / sj_drop));
      const sj_w = sj_widthTop + (sj_widthBottom - sj_widthTop) * Math.pow(sj_f, 0.8);
      sj_pos.push(sj_q.x - sj_side.x * sj_w * 0.5, sj_q.y, sj_q.z - sj_side.z * sj_w * 0.5);
      sj_pos.push(sj_q.x + sj_side.x * sj_w * 0.5, sj_q.y, sj_q.z + sj_side.z * sj_w * 0.5);
      sj_uv.push(0, sj_lens[sj_i]!, 1, sj_lens[sj_i]!);
      sj_fall.push(sj_f, sj_f);
      if (sj_i < sj_path.length - 1) {
        const sj_a = sj_i * 2;
        sj_idx.push(sj_a, sj_a + 1, sj_a + 2, sj_a + 1, sj_a + 3, sj_a + 2);
      }
    });
    const sj_geo = new BufferGeometry();
    sj_geo.setAttribute('position', new BufferAttribute(new Float32Array(sj_pos), 3));
    sj_geo.setAttribute('uv', new BufferAttribute(new Float32Array(sj_uv), 2));
    sj_geo.setAttribute('aFall', new BufferAttribute(new Float32Array(sj_fall), 1));
    sj_geo.setIndex(sj_idx);
    sj_geo.computeBoundingSphere();
    const sj_mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      fog: true,
      defines: sj_veil ? { VEIL: '' } : {},
      uniforms: UniformsUtils.merge([UniformsLib.fog, { uSeed: { value: sj_veil ? 7.3 : 0 } }]),
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
        ${sj_NOISE_GLSL}
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
    sj_mat.uniforms.uTime = sj_globalUniforms.uTime;
    sj_mat.uniforms.uSunDir = sj_globalUniforms.uSunDir;
    const sj_mesh = new Mesh(sj_geo, sj_mat);
    sj_mesh.name = sj_veil ? 'waterfall-veil' : 'waterfall-sheet';
    sj_mesh.renderOrder = sj_veil ? 4 : 3;
    return sj_mesh;
  }

  /** White water churning where the fall hits the pool. */
  private makeChurn(sj_at: Vector3): Mesh {
    const sj_radius = 3.2;
    const sj_geo = new CircleGeometry(sj_radius, 48);
    sj_geo.rotateX(-Math.PI / 2);
    const sj_mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: UniformsUtils.merge([UniformsLib.fog, { uRadius: { value: sj_radius } }]),
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
        ${sj_NOISE_GLSL}
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
    sj_mat.uniforms.uTime = sj_globalUniforms.uTime;
    const sj_mesh = new Mesh(sj_geo, sj_mat);
    sj_mesh.position.set(sj_at.x, sj_WATER_LEVEL + 0.04, sj_at.z);
    sj_mesh.name = 'waterfall-churn';
    sj_mesh.renderOrder = 2;
    return sj_mesh;
  }

  addTo(sj_scene: Scene): void {
    for (const sj_m of this.group) sj_scene.add(sj_m);
  }

  /** Mist rising from the pool, spray thrown up where the water lands. */
  update(sj_dt: number, sj_particles: Particles, sj_amount: number): void {
    const sj_out = sj_FALLS.dir;
    this.mistTimer += sj_dt * 30 * sj_amount;
    while (this.mistTimer > 1) {
      this.mistTimer -= 1;
      const sj_a = Math.random() * Math.PI * 2;
      const sj_r = Math.random() * 2.2;
      sj_particles.spawn({
        x: this.bottom.x + Math.cos(sj_a) * sj_r,
        y: sj_WATER_LEVEL + 0.3 + Math.random() * 0.8,
        z: this.bottom.z + Math.sin(sj_a) * sj_r,
        vx: Math.cos(sj_a) * 0.5 + sj_out.x * 0.9,
        vy: 0.7 + Math.random() * 1.5,
        vz: Math.sin(sj_a) * 0.5 + sj_out.z * 0.9,
        life: 2.2 + Math.random() * 1.8,
        size: 1.1,
        sizeEnd: 4.2,
        color: sj_MIST,
        alpha: 0.26,
        drag: 0.35,
        sprite: sj_SPRITE.puff,
      });
    }
    this.sprayTimer += sj_dt * 40 * sj_amount;
    while (this.sprayTimer > 1) {
      this.sprayTimer -= 1;
      const sj_a = Math.random() * Math.PI * 2;
      const sj_s = 1.5 + Math.random() * 2.5;
      sj_particles.spawn({
        x: this.bottom.x + Math.cos(sj_a) * 0.8,
        y: sj_WATER_LEVEL + 0.1,
        z: this.bottom.z + Math.sin(sj_a) * 0.8,
        vx: Math.cos(sj_a) * sj_s * 0.6,
        vy: 2.5 + Math.random() * 2.5,
        vz: Math.sin(sj_a) * sj_s * 0.6,
        life: 0.7 + Math.random() * 0.5,
        size: 0.12,
        sizeEnd: 0.05,
        color: sj_SPRAY,
        alpha: 0.8,
        gravity: 9,
        drag: 0.4,
        sprite: sj_SPRITE.drop,
      });
    }
  }
}
