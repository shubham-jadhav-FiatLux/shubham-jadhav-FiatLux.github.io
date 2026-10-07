import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import { TERRAIN_ORIGIN, TERRAIN_SIZE, type Vec2 } from './layout';

/**
 * Paintable layers of the ground. The first four pack into the main splat map, the
 * others into a second "detail" map:
 *   main:   R = dirt paths, G = stone paving, B = soft shade, A = grass suppression
 *   detail: R = warm lantern light, G = wet ground, B = leaf litter, A = gravel / stream bed
 */
export type Channel =
  'dirt' | 'stone' | 'shade' | 'nograss' | 'light' | 'wet' | 'litter' | 'gravel';

const MAIN: readonly Channel[] = ['dirt', 'stone', 'shade', 'nograss'];
const DETAIL: readonly Channel[] = ['light', 'wet', 'litter', 'gravel'];
const BLUR: Record<Channel, number> = {
  dirt: 2,
  stone: 2,
  shade: 3,
  nograss: 2,
  light: 4,
  wet: 4,
  litter: 3,
  gravel: 2,
};

/**
 * Splat maps covering the terrain, drawn with Canvas 2D (one canvas per channel, so alpha
 * stays 255 and nothing is premultiplied) and packed into two RGBA textures.
 */
export class TerrainMask {
  readonly resolution: number;
  readonly data: Uint8Array;
  readonly texture: DataTexture;
  readonly detailData: Uint8Array;
  readonly detailTexture: DataTexture;
  private canvases = new Map<Channel, CanvasRenderingContext2D>();

  constructor(resolution = 1024) {
    this.resolution = resolution;
    for (const ch of [...MAIN, ...DETAIL]) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = resolution;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, resolution, resolution);
      this.canvases.set(ch, ctx);
    }
    this.data = new Uint8Array(resolution * resolution * 4);
    this.texture = this.makeTexture(this.data);
    this.detailData = new Uint8Array(resolution * resolution * 4);
    this.detailTexture = this.makeTexture(this.detailData);
  }

  private makeTexture(data: Uint8Array): DataTexture {
    const n = this.resolution;
    const tex = new DataTexture(data, n, n, RGBAFormat, UnsignedByteType);
    tex.magFilter = LinearFilter;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    return tex;
  }

  private px(v: number): number {
    return ((v - TERRAIN_ORIGIN) / TERRAIN_SIZE) * this.resolution;
  }

  private metres(m: number): number {
    return (m / TERRAIN_SIZE) * this.resolution;
  }

  private ctx(ch: Channel, strength: number): CanvasRenderingContext2D {
    const ctx = this.canvases.get(ch)!;
    const v = Math.round(Math.min(1, Math.max(0, strength)) * 255);
    ctx.fillStyle = ctx.strokeStyle = `rgb(${v},${v},${v})`;
    return ctx;
  }

  path(points: readonly Vec2[], width: number, channel: Channel = 'dirt', strength = 1): void {
    const ctx = this.ctx(channel, strength);
    ctx.globalCompositeOperation = 'lighten';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = this.metres(width);
    ctx.beginPath();
    points.forEach(([x, z], i) => {
      if (i === 0) ctx.moveTo(this.px(x), this.px(z));
      else ctx.lineTo(this.px(x), this.px(z));
    });
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  circle(channel: Channel, x: number, z: number, radius: number, strength = 1): void {
    const ctx = this.ctx(channel, strength);
    ctx.globalCompositeOperation = 'lighten';
    ctx.beginPath();
    ctx.arc(this.px(x), this.px(z), this.metres(radius), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Soft radial blob, e.g. the shade under a tree canopy. */
  blob(channel: Channel, x: number, z: number, radius: number, strength = 1): void {
    const ctx = this.canvases.get(channel)!;
    const cx = this.px(x);
    const cz = this.px(z);
    const r = this.metres(radius);
    const v = Math.round(Math.min(1, strength) * 255);
    const g = ctx.createRadialGradient(cx, cz, 0, cx, cz, r);
    g.addColorStop(0, `rgb(${v},${v},${v})`);
    g.addColorStop(1, 'rgb(0,0,0)');
    ctx.globalCompositeOperation = 'lighten';
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cz - r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Oriented rectangle, e.g. a building footprint. */
  rect(
    channel: Channel,
    x: number,
    z: number,
    halfX: number,
    halfZ: number,
    rotation = 0,
    strength = 1,
  ): void {
    const ctx = this.ctx(channel, strength);
    ctx.save();
    ctx.globalCompositeOperation = 'lighten';
    ctx.translate(this.px(x), this.px(z));
    ctx.rotate(-rotation);
    ctx.fillRect(
      -this.metres(halfX),
      -this.metres(halfZ),
      this.metres(halfX * 2),
      this.metres(halfZ * 2),
    );
    ctx.restore();
  }

  /**
   * Paints a value computed per texel (0..1) inside a world-space box, keeping the
   * larger of old and new, e.g. grass suppression on steep ground.
   */
  field(
    channel: Channel,
    box: { x0: number; z0: number; x1: number; z1: number },
    value: (x: number, z: number) => number,
  ): void {
    const ctx = this.canvases.get(channel)!;
    const n = this.resolution;
    const i0 = Math.max(0, Math.floor(this.px(box.x0)));
    const j0 = Math.max(0, Math.floor(this.px(box.z0)));
    const i1 = Math.min(n, Math.ceil(this.px(box.x1)));
    const j1 = Math.min(n, Math.ceil(this.px(box.z1)));
    if (i1 <= i0 || j1 <= j0) return;
    const img = ctx.getImageData(i0, j0, i1 - i0, j1 - j0);
    const texel = TERRAIN_SIZE / n;
    for (let j = j0; j < j1; j++) {
      const z = TERRAIN_ORIGIN + (j + 0.5) * texel;
      for (let i = i0; i < i1; i++) {
        const x = TERRAIN_ORIGIN + (i + 0.5) * texel;
        const v = Math.round(Math.min(1, Math.max(0, value(x, z))) * 255);
        const o = ((j - j0) * (i1 - i0) + (i - i0)) * 4;
        if (v > img.data[o]!) img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
      }
    }
    ctx.putImageData(img, i0, j0);
  }

  /** Packs all channels into the textures (with a light blur for soft edges). */
  commit(): void {
    const n = this.resolution;
    const pack = (order: readonly Channel[], out: Uint8Array) => {
      order.forEach((ch, c) => {
        const img = this.canvases.get(ch)!.getImageData(0, 0, n, n).data;
        const plane = new Uint8Array(n * n);
        for (let i = 0; i < n * n; i++) plane[i] = img[i * 4]!;
        boxBlur(plane, n, BLUR[ch]);
        for (let i = 0; i < n * n; i++) out[i * 4 + c] = plane[i]!;
      });
    };
    pack(MAIN, this.data);
    pack(DETAIL, this.detailData);
    this.texture.needsUpdate = true;
    this.detailTexture.needsUpdate = true;
  }

  private index(x: number, z: number): number {
    const n = this.resolution;
    const i = Math.min(n - 1, Math.max(0, Math.floor(this.px(x))));
    const j = Math.min(n - 1, Math.max(0, Math.floor(this.px(z))));
    return (j * n + i) * 4;
  }

  /** CPU lookup (nearest texel) used for footstep surfaces and placement rules. */
  sample(x: number, z: number): { dirt: number; stone: number; shade: number; nograss: number } {
    const o = this.index(x, z);
    return {
      dirt: this.data[o]! / 255,
      stone: this.data[o + 1]! / 255,
      shade: this.data[o + 2]! / 255,
      nograss: this.data[o + 3]! / 255,
    };
  }

  sampleDetail(
    x: number,
    z: number,
  ): { light: number; wet: number; litter: number; gravel: number } {
    const o = this.index(x, z);
    return {
      light: this.detailData[o]! / 255,
      wet: this.detailData[o + 1]! / 255,
      litter: this.detailData[o + 2]! / 255,
      gravel: this.detailData[o + 3]! / 255,
    };
  }
}

/**
 * Two-pass separable box blur in place, using running sums. The vertical pass keeps one
 * running sum per column and walks the image row by row, so memory is read in order
 * (stepping down each column in turn is several times slower on a 1024² map).
 */
function boxBlur(src: Uint8Array, n: number, radius: number): void {
  if (radius <= 0) return;
  const tmp = new Uint8Array(n * n);
  const w = radius * 2 + 1;
  for (let y = 0; y < n; y++) {
    let acc = 0;
    const row = y * n;
    for (let x = -radius; x <= radius; x++) acc += src[row + Math.min(n - 1, Math.max(0, x))]!;
    for (let x = 0; x < n; x++) {
      tmp[row + x] = acc / w;
      const add = src[row + Math.min(n - 1, x + radius + 1)]!;
      const sub = src[row + Math.max(0, x - radius)]!;
      acc += add - sub;
    }
  }
  const acc = new Int32Array(n);
  for (let y = -radius; y <= radius; y++) {
    const row = Math.min(n - 1, Math.max(0, y)) * n;
    for (let x = 0; x < n; x++) acc[x]! += tmp[row + x]!;
  }
  for (let y = 0; y < n; y++) {
    const row = y * n;
    const addRow = Math.min(n - 1, y + radius + 1) * n;
    const subRow = Math.max(0, y - radius) * n;
    for (let x = 0; x < n; x++) {
      src[row + x] = acc[x]! / w;
      acc[x]! += tmp[addRow + x]! - tmp[subRow + x]!;
    }
  }
}
