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
export const sj_SPRITE = { puff: 0, petal: 1, drop: 2, spark: 3 } as const;
export type SpriteKind = (typeof sj_SPRITE)[keyof typeof sj_SPRITE];

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
  const sj_s = 128;
  const sj_canvas = document.createElement('canvas');
  sj_canvas.width = sj_canvas.height = sj_s * 2;
  const sj_ctx = sj_canvas.getContext('2d')!;
  // 0: soft puff
  let sj_g = sj_ctx.createRadialGradient(sj_s / 2, sj_s / 2, 0, sj_s / 2, sj_s / 2, sj_s / 2);
  sj_g.addColorStop(0, 'rgba(255,255,255,1)');
  sj_g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  sj_g.addColorStop(1, 'rgba(255,255,255,0)');
  sj_ctx.fillStyle = sj_g;
  sj_ctx.fillRect(0, 0, sj_s, sj_s);
  // 1: petal
  sj_ctx.save();
  sj_ctx.translate(sj_s * 1.5, sj_s * 0.5);
  sj_ctx.fillStyle = '#fff';
  sj_ctx.beginPath();
  sj_ctx.moveTo(0, -sj_s * 0.42);
  sj_ctx.bezierCurveTo(sj_s * 0.34, -sj_s * 0.3, sj_s * 0.3, sj_s * 0.3, 0, sj_s * 0.42);
  sj_ctx.bezierCurveTo(-sj_s * 0.3, sj_s * 0.3, -sj_s * 0.34, -sj_s * 0.3, 0, -sj_s * 0.42);
  sj_ctx.fill();
  sj_ctx.globalCompositeOperation = 'destination-out';
  sj_ctx.beginPath();
  sj_ctx.moveTo(-sj_s * 0.08, -sj_s * 0.44);
  sj_ctx.lineTo(0, -sj_s * 0.3);
  sj_ctx.lineTo(sj_s * 0.08, -sj_s * 0.44);
  sj_ctx.fill();
  sj_ctx.restore();
  // 2: droplet
  sj_g = sj_ctx.createRadialGradient(
    sj_s * 0.5,
    sj_s * 1.5,
    0,
    sj_s * 0.5,
    sj_s * 1.5,
    sj_s * 0.36,
  );
  sj_g.addColorStop(0, 'rgba(255,255,255,1)');
  sj_g.addColorStop(0.6, 'rgba(255,255,255,0.8)');
  sj_g.addColorStop(1, 'rgba(255,255,255,0)');
  sj_ctx.fillStyle = sj_g;
  sj_ctx.fillRect(0, sj_s, sj_s, sj_s);
  // 3: sparkle (four-point star)
  sj_ctx.save();
  sj_ctx.translate(sj_s * 1.5, sj_s * 1.5);
  sj_g = sj_ctx.createRadialGradient(0, 0, 0, 0, 0, sj_s * 0.5);
  sj_g.addColorStop(0, 'rgba(255,255,255,1)');
  sj_g.addColorStop(0.2, 'rgba(255,255,255,0.6)');
  sj_g.addColorStop(1, 'rgba(255,255,255,0)');
  sj_ctx.fillStyle = sj_g;
  sj_ctx.beginPath();
  for (let sj_i = 0; sj_i < 8; sj_i++) {
    const sj_r = sj_i % 2 === 0 ? sj_s * 0.48 : sj_s * 0.09;
    const sj_a = (sj_i / 8) * Math.PI * 2;
    sj_ctx.lineTo(Math.cos(sj_a) * sj_r, Math.sin(sj_a) * sj_r);
  }
  sj_ctx.fill();
  sj_ctx.restore();
  const sj_tex = new CanvasTexture(sj_canvas);
  sj_tex.needsUpdate = true;
  return sj_tex;
}

/**
 * CPU-simulated, GPU-drawn particle pool (dust puffs, splash droplets, petal bursts,
 * sparkles). Two layers: soft alpha-blended and additive glowing.
 */
export class Particles {
  private layers: Layer[];
  private atlas = createAtlas();

  constructor(sj_scene: Scene, sj_capacity = 1200) {
    this.layers = [
      new Layer(sj_scene, sj_capacity, this.atlas, false),
      new Layer(sj_scene, Math.floor(sj_capacity / 2), this.atlas, true),
    ];
  }

  spawn(sj_o: ParticleOptions, sj_additive = false): void {
    this.layers[sj_additive ? 1 : 0]!.spawn(sj_o);
  }

  /** Converts world-space sizes to pixels: call on resize / fov change. */
  setViewport(sj_heightPx: number, sj_fovDeg: number): void {
    const sj_scale = sj_heightPx / (2 * Math.tan((sj_fovDeg * Math.PI) / 360));
    for (const sj_l of this.layers) sj_l.material.uniforms.uScale!.value = sj_scale;
  }

  update(sj_dt: number, sj_time: number): void {
    for (const sj_l of this.layers) sj_l.update(sj_dt, sj_time);
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

  constructor(sj_scene: Scene, sj_capacity: number, sj_atlas: CanvasTexture, sj_additive: boolean) {
    this.cap = sj_capacity;
    this.data = new Float32Array(sj_capacity * this.stride);
    this.positions = new Float32Array(sj_capacity * 3);
    this.colors = new Float32Array(sj_capacity * 4);
    this.colorBase = new Float32Array(sj_capacity * 4);
    this.extras = new Float32Array(sj_capacity * 3);
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aColor', new BufferAttribute(this.colors, 4));
    this.geometry.setAttribute('aExtra', new BufferAttribute(this.extras, 3));
    this.geometry.setDrawRange(0, 0);
    const sj_material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: sj_additive ? AdditiveBlending : NormalBlending,
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
    sj_material.uniforms.uAtlas!.value = sj_atlas;
    this.material = sj_material;
    const sj_points = new Points(this.geometry, sj_material);
    sj_points.frustumCulled = false;
    sj_points.renderOrder = 5;
    sj_points.name = sj_additive ? 'particles-glow' : 'particles';
    sj_scene.add(sj_points);
  }

  spawn(sj_o: ParticleOptions): void {
    if (this.count >= this.cap) return;
    const sj_i = this.count++;
    const sj_d = this.data;
    const sj_k = sj_i * this.stride;
    sj_d[sj_k] = sj_o.x;
    sj_d[sj_k + 1] = sj_o.y;
    sj_d[sj_k + 2] = sj_o.z;
    sj_d[sj_k + 3] = sj_o.vx ?? 0;
    sj_d[sj_k + 4] = sj_o.vy ?? 0;
    sj_d[sj_k + 5] = sj_o.vz ?? 0;
    sj_d[sj_k + 6] = 0;
    sj_d[sj_k + 7] = sj_o.life;
    sj_d[sj_k + 8] = sj_o.size;
    sj_d[sj_k + 9] = sj_o.sizeEnd ?? sj_o.size;
    sj_d[sj_k + 10] = sj_o.gravity ?? 0;
    sj_d[sj_k + 11] = sj_o.drag ?? 1;
    sj_d[sj_k + 12] = sj_o.spin ?? 0;
    sj_d[sj_k + 13] = sj_o.flutter ?? 0;
    sj_d[sj_k + 14] = Math.random() * 100;
    this.color.copy(sj_o.color);
    this.colorBase[sj_i * 4] = this.color.r;
    this.colorBase[sj_i * 4 + 1] = this.color.g;
    this.colorBase[sj_i * 4 + 2] = this.color.b;
    this.colorBase[sj_i * 4 + 3] = sj_o.alpha ?? 1;
    this.extras[sj_i * 3 + 2] = sj_o.sprite ?? 0;
    this.extras[sj_i * 3 + 1] = Math.random() * Math.PI * 2;
  }

  update(sj_dt: number, sj_time: number): void {
    const sj_d = this.data;
    const sj_s = this.stride;
    let sj_i = 0;
    while (sj_i < this.count) {
      const sj_k = sj_i * sj_s;
      sj_d[sj_k + 6]! += sj_dt;
      if (sj_d[sj_k + 6]! >= sj_d[sj_k + 7]!) {
        // swap-remove with the last particle
        const sj_last = this.count - 1;
        if (sj_i !== sj_last) {
          sj_d.copyWithin(sj_k, sj_last * sj_s, sj_last * sj_s + sj_s);
          this.colorBase.copyWithin(sj_i * 4, sj_last * 4, sj_last * 4 + 4);
          this.extras.copyWithin(sj_i * 3, sj_last * 3, sj_last * 3 + 3);
        }
        this.count--;
        continue;
      }
      const sj_drag = Math.pow(sj_d[sj_k + 11]!, sj_dt);
      sj_d[sj_k + 3]! *= sj_drag;
      sj_d[sj_k + 4]! = sj_d[sj_k + 4]! * sj_drag - sj_d[sj_k + 10]! * sj_dt;
      sj_d[sj_k + 5]! *= sj_drag;
      const sj_flutter = sj_d[sj_k + 13]!;
      const sj_seed = sj_d[sj_k + 14]!;
      sj_d[sj_k]! += (sj_d[sj_k + 3]! + Math.sin(sj_time * 3.1 + sj_seed) * sj_flutter) * sj_dt;
      sj_d[sj_k + 1]! += sj_d[sj_k + 4]! * sj_dt;
      sj_d[sj_k + 2]! += (sj_d[sj_k + 5]! + Math.cos(sj_time * 2.7 + sj_seed) * sj_flutter) * sj_dt;
      const sj_t = sj_d[sj_k + 6]! / sj_d[sj_k + 7]!;
      this.positions[sj_i * 3] = sj_d[sj_k]!;
      this.positions[sj_i * 3 + 1] = sj_d[sj_k + 1]!;
      this.positions[sj_i * 3 + 2] = sj_d[sj_k + 2]!;
      const sj_fadeIn = Math.min(1, sj_t * 8);
      const sj_fadeOut = 1 - sj_t * sj_t;
      this.colors[sj_i * 4] = this.colorBase[sj_i * 4]!;
      this.colors[sj_i * 4 + 1] = this.colorBase[sj_i * 4 + 1]!;
      this.colors[sj_i * 4 + 2] = this.colorBase[sj_i * 4 + 2]!;
      this.colors[sj_i * 4 + 3] = this.colorBase[sj_i * 4 + 3]! * sj_fadeIn * sj_fadeOut;
      this.extras[sj_i * 3] = sj_d[sj_k + 8]! + (sj_d[sj_k + 9]! - sj_d[sj_k + 8]!) * sj_t;
      this.extras[sj_i * 3 + 1]! += sj_d[sj_k + 12]! * sj_dt;
      sj_i++;
    }
    this.geometry.setDrawRange(0, this.count);
    (this.geometry.attributes.position as BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aColor as BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aExtra as BufferAttribute).needsUpdate = true;
  }
}
