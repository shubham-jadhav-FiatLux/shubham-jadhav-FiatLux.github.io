import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  Mesh,
  ShaderMaterial,
  type Scene,
  type Vector3,
} from 'three';
import { sj_globalUniforms } from '../render/uniforms';
import type { Particles } from './Particles';
import { sj_SPRITE } from './Particles';

/** From the start of a discovery to its scroll: the bow and the golden light (ms). */
export const sj_CEREMONY_MS = 2400;

const sj_PETALS = ['#fbd3e0', '#f6b3c9', '#f29ab7', '#fde9ef'].map((sj_c) => new Color(sj_c));
const sj_GOLD = new Color('#ffd27a');

/**
 * The discovery moment: a column of warm light, a golden ink ring that races across the
 * ground and grass (terrain/grass shaders read `uRipple`), and a burst of petals and sparks.
 */
export class DiscoveryFx {
  private pillar: Mesh<CylinderGeometry, ShaderMaterial>;
  private age = 99;

  constructor(
    sj_scene: Scene,
    private readonly particles: Particles,
  ) {
    const sj_geo = new CylinderGeometry(1.1, 1.6, 14, 24, 1, true);
    sj_geo.translate(0, 7, 0);
    const sj_mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uAge: { value: 99 }, uTime: sj_globalUniforms.uTime },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vNormalV;
        varying vec3 vView;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormalV = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uAge;
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vNormalV;
        varying vec3 vView;
        void main() {
          float rim = pow(abs(dot(vNormalV, vView)), 1.5);
          float fadeUp = pow(1.0 - vUv.y, 1.6);
          float flicker = 0.85 + 0.15 * sin(vUv.x * 40.0 + uTime * 6.0);
          float life = smoothstep(0.0, 0.25, uAge) * (1.0 - smoothstep(0.9, 2.2, uAge));
          float a = rim * fadeUp * flicker * life;
          gl_FragColor = vec4(vec3(1.0, 0.78, 0.42) * a * 1.4, a);
        }
      `,
    });
    this.pillar = new Mesh(sj_geo, sj_mat);
    this.pillar.visible = false;
    this.pillar.frustumCulled = false;
    this.pillar.renderOrder = 7;
    this.pillar.name = 'discovery-pillar';
    sj_scene.add(this.pillar);
  }

  play(sj_at: Vector3, sj_strength = 1): void {
    this.age = 0;
    this.pillar.position.copy(sj_at);
    this.pillar.visible = true;
    sj_globalUniforms.uRipple.value.set(sj_at.x, sj_at.z, 0, sj_strength);
    for (let sj_i = 0; sj_i < 70; sj_i++) {
      const sj_a = Math.random() * Math.PI * 2;
      const sj_sp = 1.5 + Math.random() * 3.5;
      this.particles.spawn({
        x: sj_at.x + Math.cos(sj_a) * 0.4,
        y: sj_at.y + 0.6 + Math.random() * 0.8,
        z: sj_at.z + Math.sin(sj_a) * 0.4,
        vx: Math.cos(sj_a) * sj_sp,
        vy: 3 + Math.random() * 4,
        vz: Math.sin(sj_a) * sj_sp,
        life: 2 + Math.random() * 1.5,
        size: 0.14 + Math.random() * 0.08,
        color: sj_PETALS[sj_i % sj_PETALS.length]!,
        gravity: 3.2,
        drag: 0.35,
        spin: (Math.random() - 0.5) * 8,
        flutter: 0.6,
        sprite: sj_SPRITE.petal,
      });
    }
    for (let sj_i = 0; sj_i < 36; sj_i++) {
      const sj_a = Math.random() * Math.PI * 2;
      const sj_sp = 0.6 + Math.random() * 1.6;
      this.particles.spawn(
        {
          x: sj_at.x + Math.cos(sj_a) * 0.6,
          y: sj_at.y + 0.2 + Math.random() * 2.5,
          z: sj_at.z + Math.sin(sj_a) * 0.6,
          vx: Math.cos(sj_a) * sj_sp,
          vy: 1 + Math.random() * 2.5,
          vz: Math.sin(sj_a) * sj_sp,
          life: 1.2 + Math.random() * 1.2,
          size: 0.22,
          sizeEnd: 0.05,
          color: sj_GOLD,
          alpha: 0.9,
          drag: 0.3,
          sprite: sj_SPRITE.spark,
        },
        true,
      );
    }
  }

  update(sj_dt: number): void {
    this.age += sj_dt;
    sj_globalUniforms.uRipple.value.z += sj_dt;
    this.pillar.material.uniforms.uAge!.value = this.age;
    if (this.age > 2.4) this.pillar.visible = false;
  }
}
