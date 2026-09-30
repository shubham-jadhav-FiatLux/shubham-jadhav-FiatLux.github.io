import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  Mesh,
  ShaderMaterial,
  type Scene,
  type Vector3,
} from 'three';
import { globalUniforms } from '../render/uniforms';
import type { Particles } from './Particles';
import { SPRITE } from './Particles';

const PETALS = ['#fbd3e0', '#f6b3c9', '#f29ab7', '#fde9ef'].map((c) => new Color(c));
const GOLD = new Color('#ffd27a');

/**
 * The discovery moment: a column of warm light, a golden ink ring that races across the
 * ground and grass (terrain/grass shaders read `uRipple`), and a burst of petals and sparks.
 */
export class DiscoveryFx {
  private pillar: Mesh<CylinderGeometry, ShaderMaterial>;
  private age = 99;

  constructor(
    scene: Scene,
    private readonly particles: Particles,
  ) {
    const geo = new CylinderGeometry(1.1, 1.6, 14, 24, 1, true);
    geo.translate(0, 7, 0);
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uAge: { value: 99 }, uTime: globalUniforms.uTime },
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
    this.pillar = new Mesh(geo, mat);
    this.pillar.visible = false;
    this.pillar.frustumCulled = false;
    this.pillar.renderOrder = 7;
    this.pillar.name = 'discovery-pillar';
    scene.add(this.pillar);
  }

  play(at: Vector3, strength = 1): void {
    this.age = 0;
    this.pillar.position.copy(at);
    this.pillar.visible = true;
    globalUniforms.uRipple.value.set(at.x, at.z, 0, strength);
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3.5;
      this.particles.spawn({
        x: at.x + Math.cos(a) * 0.4,
        y: at.y + 0.6 + Math.random() * 0.8,
        z: at.z + Math.sin(a) * 0.4,
        vx: Math.cos(a) * sp,
        vy: 3 + Math.random() * 4,
        vz: Math.sin(a) * sp,
        life: 2 + Math.random() * 1.5,
        size: 0.14 + Math.random() * 0.08,
        color: PETALS[i % PETALS.length]!,
        gravity: 3.2,
        drag: 0.35,
        spin: (Math.random() - 0.5) * 8,
        flutter: 0.6,
        sprite: SPRITE.petal,
      });
    }
    for (let i = 0; i < 36; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.6 + Math.random() * 1.6;
      this.particles.spawn(
        {
          x: at.x + Math.cos(a) * 0.6,
          y: at.y + 0.2 + Math.random() * 2.5,
          z: at.z + Math.sin(a) * 0.6,
          vx: Math.cos(a) * sp,
          vy: 1 + Math.random() * 2.5,
          vz: Math.sin(a) * sp,
          life: 1.2 + Math.random() * 1.2,
          size: 0.22,
          sizeEnd: 0.05,
          color: GOLD,
          alpha: 0.9,
          drag: 0.3,
          sprite: SPRITE.spark,
        },
        true,
      );
    }
  }

  update(dt: number): void {
    this.age += dt;
    globalUniforms.uRipple.value.z += dt;
    this.pillar.material.uniforms.uAge!.value = this.age;
    if (this.age > 2.4) this.pillar.visible = false;
  }
}
