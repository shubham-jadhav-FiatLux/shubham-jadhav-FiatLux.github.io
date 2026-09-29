import {
  BufferAttribute,
  Color,
  CylinderGeometry,
  DoubleSide,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  NormalBlending,
  ShaderMaterial,
  Vector2,
  type BufferGeometry,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Random } from '../utils/random';
import { SimplexNoise } from '../utils/noise';
import { ATMOSPHERE } from '../render/atmosphere';
import { globalUniforms } from '../render/uniforms';
import { NOISE_GLSL } from '../render/glsl';

interface Ring {
  radius: number;
  spread: number;
  count: number;
  height: [number, number];
  width: [number, number];
  seed: number;
}

const RINGS: Ring[] = [
  { radius: 172, spread: 26, count: 34, height: [50, 110], width: [18, 32], seed: 11 },
  { radius: 290, spread: 40, count: 38, height: [90, 175], width: [28, 50], seed: 23 },
  { radius: 500, spread: 70, count: 32, height: [160, 290], width: [50, 90], seed: 37 },
];

/**
 * Rings of rounded karst peaks around the valley (think Guilin / Zhangjiajie), with
 * bands of drifting mist between them. The atmospheric fog turns each ring a paler,
 * cooler shade, which gives the layered ink-painting depth.
 */
export class Mountains {
  readonly meshes: Mesh[] = [];
  private noise = new SimplexNoise(99);

  constructor() {
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
    });
    RINGS.forEach((ring, index) => {
      const geo = this.buildRing(ring, index);
      const mesh = new Mesh(geo, material);
      mesh.name = `mountains-${index}`;
      mesh.matrixAutoUpdate = false;
      this.meshes.push(mesh);
    });
    this.meshes.push(...this.buildMist());
  }

  addTo(scene: Scene): void {
    for (const m of this.meshes) scene.add(m);
  }

  private buildPeak(rand: Random, height: number, width: number, ringIndex: number) {
    const points: Vector2[] = [];
    const steps = 18;
    const shape = rand.range(2.2, 3.6); // how bulbous the top is
    const taper = rand.range(0.15, 0.35);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Karst tower: steep sides, rounded cap and a slight flare at the foot.
      const core = Math.pow(Math.max(0, 1 - Math.pow(t, shape)), 0.6);
      const flare = 1 + 0.35 * Math.pow(1 - t, 5);
      const r = width * core * flare * (1 - t * taper);
      points.push(new Vector2(Math.max(r, 0.001), t * height));
    }
    const geo = new LatheGeometry(points, 28);
    const pos = geo.attributes.position as BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const foot = new Color(ringIndex === 0 ? '#6f8660' : '#7a8c78');
    const rock = new Color('#8f958c');
    const crown = new Color(ringIndex === 0 ? '#3f6636' : '#4d6b4a');
    const c = new Color();
    const seed = rand.range(0, 100);
    const grooves = rand.int(5, 11);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const t = y / height;
      const angle = Math.atan2(z, x);
      const n = this.noise.fbm3(x * 0.018 + seed, y * 0.014, z * 0.018, 3);
      // Soft bulges plus vertical erosion grooves.
      const bulge = 1 + n * 0.16 + Math.cos(angle * grooves + n * 3) * 0.035 * (1 - t);
      pos.setX(i, x * bulge);
      pos.setZ(i, z * bulge);
      // Dense vegetation on the crown, streaky rock on the steep flanks.
      const veg = Math.min(1, Math.max(0, (t - 0.45) * 2.4 + n * 0.9));
      const streak = Math.max(0, Math.sin(angle * grooves * 2 + n * 5)) * (1 - veg) * 0.5;
      c.copy(foot).lerp(rock, streak).lerp(crown, veg);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }

  private buildRing(ring: Ring, index: number): BufferGeometry {
    const rand = new Random(ring.seed);
    const parts: BufferGeometry[] = [];
    for (let i = 0; i < ring.count; i++) {
      const a = (i / ring.count) * Math.PI * 2 + rand.spread(0.08);
      const r = ring.radius + rand.spread(ring.spread);
      const h = rand.range(ring.height[0], ring.height[1]);
      const w = rand.range(ring.width[0], ring.width[1]);
      const peak = this.buildPeak(rand, h, w, index);
      // A few peaks come in clusters of two for variety.
      peak.translate(Math.cos(a) * r, -8, Math.sin(a) * r);
      parts.push(peak);
      if (rand.chance(0.45)) {
        const h2 = h * rand.range(0.45, 0.75);
        const w2 = w * rand.range(0.5, 0.8);
        const extra = this.buildPeak(rand, h2, w2, index);
        const a2 = a + rand.spread(0.06);
        const r2 = r + rand.range(-0.4, 0.4) * w;
        extra.translate(Math.cos(a2) * r2, -8, Math.sin(a2) * r2);
        parts.push(extra);
      }
    }
    const merged = mergeGeometries(parts, false)!;
    parts.forEach((p) => p.dispose());
    return merged;
  }

  /** Semi-transparent cylinders of scrolling mist between the rings. */
  private buildMist(): Mesh[] {
    const bands = [
      { radius: 150, y: 8, height: 26, alpha: 0.5 },
      { radius: 235, y: 16, height: 40, alpha: 0.55 },
      { radius: 380, y: 26, height: 60, alpha: 0.6 },
    ];
    return bands.map((b, i) => {
      const geo = new CylinderGeometry(b.radius, b.radius, b.height, 96, 1, true);
      geo.translate(0, b.y + b.height / 2, 0);
      const mat = new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: NormalBlending,
        fog: false,
        uniforms: {
          uTime: globalUniforms.uTime,
          uColor: { value: ATMOSPHERE.fogColor.clone().lerp(new Color('#ffffff'), 0.15) },
          uAlpha: { value: b.alpha },
          uSeed: { value: i * 17.3 },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uColor;
          uniform float uAlpha;
          uniform float uSeed;
          varying vec2 vUv;
          ${NOISE_GLSL}
          void main() {
            vec2 p = vec2(vUv.x * 28.0 + uTime * 0.01 + uSeed, vUv.y * 2.2);
            float n = fbm(p) + 0.5 * fbm(p * 2.3 + uTime * 0.02);
            float vertical = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.45, 1.0, vUv.y));
            float a = smoothstep(0.45, 1.05, n) * vertical * uAlpha;
            gl_FragColor = vec4(uColor, a);
          }
        `,
      });
      const mesh = new Mesh(geo, mat);
      mesh.name = `mist-${i}`;
      mesh.renderOrder = 2;
      mesh.matrixAutoUpdate = false;
      return mesh;
    });
  }
}
