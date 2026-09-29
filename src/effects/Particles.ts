import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  NormalBlending,
  Points,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  type Scene,
} from 'three';

/** Sprite kinds in the procedural atlas (2 x 2). */
export const SPRITE = { puff: 0, petal: 1, drop: 2, spark: 3 } as const;
export type SpriteKind = (typeof SPRITE)[keyof typeof SPRITE];

export interface ParticleOptions {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  sizeEnd?: number;
  color: Color;
  alpha?: number;
  gravity?: number;
  drag?: number;
  spin?: number;
  sprite?: SpriteKind;
  /** wobble amplitude for fluttering petals */
  flutter?: number;
}

function createAtlas(): CanvasTexture {
  const s = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s * 2;
  const ctx = canvas.getContext('2d')!;
  // 0: soft puff
  let g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  // 1: petal
  ctx.save();
  ctx.translate(s * 1.5, s * 0.5);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.42);
  ctx.bezierCurveTo(s * 0.34, -s * 0.3, s * 0.3, s * 0.3, 0, s * 0.42);
  ctx.bezierCurveTo(-s * 0.3, s * 0.3, -s * 0.34, -s * 0.3, 0, -s * 0.42);
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(-s * 0.08, -s * 0.44);
  ctx.lineTo(0, -s * 0.3);
  ctx.lineTo(s * 0.08, -s * 0.44);
  ctx.fill();
  ctx.restore();
  // 2: droplet
  g = ctx.createRadialGradient(s * 0.5, s * 1.5, 0, s * 0.5, s * 1.5, s * 0.36);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, s, s, s);
  // 3: sparkle (four-point star)
  ctx.save();
  ctx.translate(s * 1.5, s * 1.5);
  g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? s * 0.48 : s * 0.09;
    const a = (i / 8) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.fill();
  ctx.restore();
  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * CPU-simulated, GPU-drawn particle pool (dust puffs, splash droplets, petal bursts,
 * sparkles). Two layers: soft alpha-blended and additive glowing.
 */
export class Particles {
  private layers: Layer[];
  private atlas = createAtlas();

  constructor(scene: Scene, capacity = 1200) {
    this.layers = [
      new Layer(scene, capacity, this.atlas, false),
      new Layer(scene, Math.floor(capacity / 2), this.atlas, true),
    ];
  }

  spawn(o: ParticleOptions, additive = false): void {
    this.layers[additive ? 1 : 0]!.spawn(o);
  }

  /** Converts world-space sizes to pixels: call on resize / fov change. */
  setViewport(heightPx: number, fovDeg: number): void {
    const scale = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    for (const l of this.layers) l.material.uniforms.uScale!.value = scale;
  }

  update(dt: number, time: number): void {
    for (const l of this.layers) l.update(dt, time);
  }
}

class Layer {
  private count = 0;
  private cap: number;
  private data: Float32Array; // x y z vx vy vz age life size sizeEnd gravity drag spin flutter seed
  private stride = 15;
  private positions: Float32Array;
  private colors: Float32Array; // r g b a
  private extras: Float32Array; // size, rotation, sprite
  private geometry: BufferGeometry;
  private color = new Color();
  private colorBase: Float32Array;
  readonly material: ShaderMaterial;

  constructor(scene: Scene, capacity: number, atlas: CanvasTexture, additive: boolean) {
    this.cap = capacity;
    this.data = new Float32Array(capacity * this.stride);
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 4);
    this.colorBase = new Float32Array(capacity * 4);
    this.extras = new Float32Array(capacity * 3);
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aColor', new BufferAttribute(this.colors, 4));
    this.geometry.setAttribute('aExtra', new BufferAttribute(this.extras, 3));
    this.geometry.setDrawRange(0, 0);
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
      fog: true,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        { uAtlas: { value: null }, uScale: { value: 600 } },
      ]),
      vertexShader: /* glsl */ `
        attribute vec4 aColor;
        attribute vec3 aExtra;
        uniform float uScale;
        varying vec4 vColor;
        varying float vRot;
        varying float vSprite;
        #include <fog_pars_vertex>
        void main() {
          vColor = aColor;
          vRot = aExtra.y;
          vSprite = aExtra.z;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = aExtra.x * uScale / max(-mvPosition.z, 0.1);
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uAtlas;
        varying vec4 vColor;
        varying float vRot;
        varying float vSprite;
        #include <fog_pars_fragment>
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float c = cos(vRot);
          float s = sin(vRot);
          uv = mat2(c, -s, s, c) * uv + 0.5;
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
          vec2 cell = vec2(mod(vSprite, 2.0), floor(vSprite / 2.0));
          vec4 tex = texture2D(uAtlas, (uv + cell) * 0.5);
          float a = tex.a * vColor.a;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor.rgb, a);
          #include <fog_fragment>
        }
      `,
    });
    material.uniforms.uAtlas!.value = atlas;
    this.material = material;
    const points = new Points(this.geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 5;
    points.name = additive ? 'particles-glow' : 'particles';
    scene.add(points);
  }

  spawn(o: ParticleOptions): void {
    if (this.count >= this.cap) return;
    const i = this.count++;
    const d = this.data;
    const k = i * this.stride;
    d[k] = o.x;
    d[k + 1] = o.y;
    d[k + 2] = o.z;
    d[k + 3] = o.vx ?? 0;
    d[k + 4] = o.vy ?? 0;
    d[k + 5] = o.vz ?? 0;
    d[k + 6] = 0;
    d[k + 7] = o.life;
    d[k + 8] = o.size;
    d[k + 9] = o.sizeEnd ?? o.size;
    d[k + 10] = o.gravity ?? 0;
    d[k + 11] = o.drag ?? 1;
    d[k + 12] = o.spin ?? 0;
    d[k + 13] = o.flutter ?? 0;
    d[k + 14] = Math.random() * 100;
    this.color.copy(o.color);
    this.colorBase[i * 4] = this.color.r;
    this.colorBase[i * 4 + 1] = this.color.g;
    this.colorBase[i * 4 + 2] = this.color.b;
    this.colorBase[i * 4 + 3] = o.alpha ?? 1;
    this.extras[i * 3 + 2] = o.sprite ?? 0;
    this.extras[i * 3 + 1] = Math.random() * Math.PI * 2;
  }

  update(dt: number, time: number): void {
    const d = this.data;
    const s = this.stride;
    let i = 0;
    while (i < this.count) {
      const k = i * s;
      d[k + 6]! += dt;
      if (d[k + 6]! >= d[k + 7]!) {
        // swap-remove with the last particle
        const last = this.count - 1;
        if (i !== last) {
          d.copyWithin(k, last * s, last * s + s);
          this.colorBase.copyWithin(i * 4, last * 4, last * 4 + 4);
          this.extras.copyWithin(i * 3, last * 3, last * 3 + 3);
        }
        this.count--;
        continue;
      }
      const drag = Math.pow(d[k + 11]!, dt);
      d[k + 3]! *= drag;
      d[k + 4]! = d[k + 4]! * drag - d[k + 10]! * dt;
      d[k + 5]! *= drag;
      const flutter = d[k + 13]!;
      const seed = d[k + 14]!;
      d[k]! += (d[k + 3]! + Math.sin(time * 3.1 + seed) * flutter) * dt;
      d[k + 1]! += d[k + 4]! * dt;
      d[k + 2]! += (d[k + 5]! + Math.cos(time * 2.7 + seed) * flutter) * dt;
      const t = d[k + 6]! / d[k + 7]!;
      this.positions[i * 3] = d[k]!;
      this.positions[i * 3 + 1] = d[k + 1]!;
      this.positions[i * 3 + 2] = d[k + 2]!;
      const fadeIn = Math.min(1, t * 8);
      const fadeOut = 1 - t * t;
      this.colors[i * 4] = this.colorBase[i * 4]!;
      this.colors[i * 4 + 1] = this.colorBase[i * 4 + 1]!;
      this.colors[i * 4 + 2] = this.colorBase[i * 4 + 2]!;
      this.colors[i * 4 + 3] = this.colorBase[i * 4 + 3]! * fadeIn * fadeOut;
      this.extras[i * 3] = d[k + 8]! + (d[k + 9]! - d[k + 8]!) * t;
      this.extras[i * 3 + 1]! += d[k + 12]! * dt;
      i++;
    }
    this.geometry.setDrawRange(0, this.count);
    (this.geometry.attributes.position as BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aColor as BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aExtra as BufferAttribute).needsUpdate = true;
  }
}
