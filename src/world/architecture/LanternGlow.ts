import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  PointLight,
  Points,
  ShaderMaterial,
  Vector3,
  type Scene,
} from 'three';
import { sj_globalUniforms } from '../../render/uniforms';
import type { LightSpot } from './Builder';
import type { QualitySettings } from '../../core/Quality';

const sj_COLORS: Record<LightSpot['kind'], Color> = {
  paper: new Color(1.0, 0.42, 0.14),
  stone: new Color(1.0, 0.66, 0.3),
  altar: new Color(1.0, 0.78, 0.45),
};
const sj_HALO_SIZE: Record<LightSpot['kind'], number> = { paper: 5.2, stone: 4.6, altar: 3.6 };
const sj_tmp = new Vector3();

/** Real lights only where there is GPU to spare: 3 on High, 1 on Medium, none on Low. */
function lightsFor(sj_s: QualitySettings): number {
  return sj_s.level === 'high' ? 3 : sj_s.level === 'medium' ? 1 : 0;
}

/**
 * The warm light of the lanterns: a soft halo around every one (a single additive point
 * cloud) and, on the higher presets, a few real point lights that follow the lanterns
 * nearest to the panda so it and the buildings around it catch the glow.
 *
 * The number of lights is fixed when the valley is built: every lit shader is compiled
 * for that many, so changing it later (e.g. when adaptive quality steps down) would stall
 * the game while they all recompile. A lower preset just switches the extra lights off.
 */
export class LanternGlow {
  readonly points: Points<BufferGeometry, ShaderMaterial>;
  private lights: PointLight[] = [];
  private assigned: number[] = [];
  private retarget = 0;
  private active = 0;

  constructor(
    private readonly spots: LightSpot[],
    sj_settings: QualitySettings,
  ) {
    const sj_lightCount = lightsFor(sj_settings);
    this.active = sj_lightCount;
    const sj_n = spots.length;
    const sj_pos = new Float32Array(sj_n * 3);
    const sj_size = new Float32Array(sj_n);
    const sj_color = new Float32Array(sj_n * 3);
    const sj_phase = new Float32Array(sj_n);
    spots.forEach((sj_s, sj_i) => {
      sj_pos.set([sj_s.x, sj_s.y, sj_s.z], sj_i * 3);
      sj_size[sj_i] = sj_s.size * sj_HALO_SIZE[sj_s.kind];
      const sj_c = sj_COLORS[sj_s.kind];
      sj_color.set([sj_c.r, sj_c.g, sj_c.b], sj_i * 3);
      sj_phase[sj_i] = (sj_s.x * 12.9898 + sj_s.z * 78.233) % 6.283;
    });
    const sj_geo = new BufferGeometry();
    sj_geo.setAttribute('position', new BufferAttribute(sj_pos, 3));
    sj_geo.setAttribute('aSize', new BufferAttribute(sj_size, 1));
    sj_geo.setAttribute('aColor', new BufferAttribute(sj_color, 3));
    sj_geo.setAttribute('aPhase', new BufferAttribute(sj_phase, 1));
    const sj_material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: sj_globalUniforms.uTime,
        uScale: { value: 800 },
        uIntensity: { value: 0.55 },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute vec3 aColor;
        attribute float aPhase;
        uniform float uTime;
        uniform float uScale;
        varying vec3 vColor;
        varying float vFade;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // pull the halo towards the camera so the lantern body does not cut it in half
          mv.xyz += normalize(-mv.xyz) * aSize * 0.25;
          gl_Position = projectionMatrix * mv;
          float flicker = 0.85 + 0.1 * sin(uTime * 7.3 + aPhase) + 0.05 * sin(uTime * 13.1 + aPhase * 2.0);
          vColor = aColor * flicker;
          float dist = -mv.z;
          vFade = exp(-dist / 70.0) * smoothstep(0.6, 2.0, dist);
          gl_PointSize = aSize * uScale / max(dist, 0.1);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uIntensity;
        varying vec3 vColor;
        varying float vFade;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          float glow = exp(-d * d * 5.0) * (1.0 - d) + exp(-d * d * 40.0) * 0.6;
          gl_FragColor = vec4(vColor * glow * uIntensity * vFade, 1.0);
        }
      `,
    });
    this.points = new Points(sj_geo, sj_material);
    this.points.name = 'lantern-halos';
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;

    for (let sj_i = 0; sj_i < sj_lightCount; sj_i++) {
      const sj_light = new PointLight(0xffa25a, 0, 9, 2);
      sj_light.castShadow = false;
      this.lights.push(sj_light);
      this.assigned.push(-1);
    }
  }

  /** Switches lights off (never removes them: see the class comment). */
  applyQuality(sj_s: QualitySettings): void {
    this.active = Math.min(this.lights.length, lightsFor(sj_s));
  }

  addTo(sj_scene: Scene): void {
    sj_scene.add(this.points);
    for (const sj_l of this.lights) sj_scene.add(sj_l);
  }

  /** Converts world-space halo sizes to pixels: call on resize / fov change. */
  setViewport(sj_heightPx: number, sj_fovDeg: number): void {
    this.points.material.uniforms.uScale!.value =
      sj_heightPx / (2 * Math.tan((sj_fovDeg * Math.PI) / 360));
  }

  /** Moves the point lights to the lanterns nearest `sj_focus`, with a candle flicker. */
  update(sj_dt: number, sj_time: number, sj_focus: Vector3): void {
    if (!this.lights.length) return;
    this.retarget -= sj_dt;
    if (this.retarget <= 0) {
      this.retarget = 0.4;
      const sj_nearest = this.spots
        .map((sj_s, sj_i) => ({
          i: sj_i,
          d: sj_tmp.set(sj_s.x, sj_s.y, sj_s.z).distanceToSquared(sj_focus),
        }))
        .sort((sj_a, sj_b) => sj_a.d - sj_b.d)
        .slice(0, this.lights.length);
      sj_nearest.forEach((sj_n, sj_k) => {
        this.assigned[sj_k] = sj_n.d < 22 * 22 ? sj_n.i : -1;
      });
    }
    this.lights.forEach((sj_light, sj_k) => {
      const sj_i = this.assigned[sj_k]!;
      if (sj_i < 0 || sj_k >= this.active) {
        sj_light.intensity = 0;
        return;
      }
      const sj_s = this.spots[sj_i]!;
      sj_light.position.set(sj_s.x, sj_s.y - sj_s.size * 0.4, sj_s.z);
      const sj_base = sj_s.kind === 'paper' ? 4.5 : sj_s.kind === 'stone' ? 3.5 : 2;
      sj_light.intensity = sj_base * (0.88 + 0.12 * Math.sin(sj_time * 9.1 + sj_i * 1.7));
    });
  }
}
