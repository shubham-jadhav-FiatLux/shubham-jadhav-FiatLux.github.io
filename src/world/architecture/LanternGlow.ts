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
import { globalUniforms } from '../../render/uniforms';
import type { LightSpot } from './Builder';
import type { QualitySettings } from '../../core/Quality';

const COLORS: Record<LightSpot['kind'], Color> = {
  paper: new Color(1.0, 0.42, 0.14),
  stone: new Color(1.0, 0.66, 0.3),
  altar: new Color(1.0, 0.78, 0.45),
};
const HALO_SIZE: Record<LightSpot['kind'], number> = { paper: 5.2, stone: 4.6, altar: 3.6 };
const tmp = new Vector3();

/** Real lights only where there is GPU to spare: 3 on High, 1 on Medium, none on Low. */
function lightsFor(s: QualitySettings): number {
  return s.level === 'high' ? 3 : s.level === 'medium' ? 1 : 0;
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
    settings: QualitySettings,
  ) {
    const lightCount = lightsFor(settings);
    this.active = lightCount;
    const n = spots.length;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const color = new Float32Array(n * 3);
    const phase = new Float32Array(n);
    spots.forEach((s, i) => {
      pos.set([s.x, s.y, s.z], i * 3);
      size[i] = s.size * HALO_SIZE[s.kind];
      const c = COLORS[s.kind];
      color.set([c.r, c.g, c.b], i * 3);
      phase[i] = (s.x * 12.9898 + s.z * 78.233) % 6.283;
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new BufferAttribute(size, 1));
    geo.setAttribute('aColor', new BufferAttribute(color, 3));
    geo.setAttribute('aPhase', new BufferAttribute(phase, 1));
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: globalUniforms.uTime,
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
    this.points = new Points(geo, material);
    this.points.name = 'lantern-halos';
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;

    for (let i = 0; i < lightCount; i++) {
      const light = new PointLight(0xffa25a, 0, 9, 2);
      light.castShadow = false;
      this.lights.push(light);
      this.assigned.push(-1);
    }
  }

  /** Switches lights off (never removes them: see the class comment). */
  applyQuality(s: QualitySettings): void {
    this.active = Math.min(this.lights.length, lightsFor(s));
  }

  addTo(scene: Scene): void {
    scene.add(this.points);
    for (const l of this.lights) scene.add(l);
  }

  /** Converts world-space halo sizes to pixels: call on resize / fov change. */
  setViewport(heightPx: number, fovDeg: number): void {
    this.points.material.uniforms.uScale!.value =
      heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  /** Moves the point lights to the lanterns nearest `focus`, with a candle flicker. */
  update(dt: number, time: number, focus: Vector3): void {
    if (!this.lights.length) return;
    this.retarget -= dt;
    if (this.retarget <= 0) {
      this.retarget = 0.4;
      const nearest = this.spots
        .map((s, i) => ({ i, d: tmp.set(s.x, s.y, s.z).distanceToSquared(focus) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, this.lights.length);
      nearest.forEach((n, k) => {
        this.assigned[k] = n.d < 22 * 22 ? n.i : -1;
      });
    }
    this.lights.forEach((light, k) => {
      const i = this.assigned[k]!;
      if (i < 0 || k >= this.active) {
        light.intensity = 0;
        return;
      }
      const s = this.spots[i]!;
      light.position.set(s.x, s.y - s.size * 0.4, s.z);
      const base = s.kind === 'paper' ? 4.5 : s.kind === 'stone' ? 3.5 : 2;
      light.intensity = base * (0.88 + 0.12 * Math.sin(time * 9.1 + i * 1.7));
    });
  }
}
