import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import { TERRAIN_ORIGIN, TERRAIN_SIZE, type Vec2 } from './layout';

type Channel = 'dirt' | 'stone' | 'shade' | 'nograss';

/**
 * A painted "splat map" covering the terrain, drawn with Canvas 2D and packed into one
 * RGBA texture:
 *   R = dirt paths, G = stone paving, B = soft shade (baked contact shadows),
 *   A = extra grass suppression (under buildings, rocks...).
 * Each channel is drawn on its own canvas (alpha stays 255) to avoid premultiplication.
 */
export class TerrainMask {
  readonly resolution: number;
  readonly data: Uint8Array;
  readonly texture: DataTexture;
  private canvases = new Map<Channel, CanvasRenderingContext2D>();

  constructor(resolution = 1024) {
    this.resolution = resolution;
    this.data = new Uint8Array(resolution * resolution * 4);
    for (const ch of ['dirt', 'stone', 'shade', 'nograss'] as Channel[]) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = resolution;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, resolution, resolution);
      this.canvases.set(ch, ctx);
    }
    this.texture = new DataTexture(this.data, resolution, resolution, RGBAFormat, UnsignedByteType);
    this.texture.magFilter = LinearFilter;
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.generateMipmaps = true;
    this.texture.anisotropy = 4;
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

  /** Packs all channels into the texture (with a light blur for soft edges). */
  commit(): void {
    const n = this.resolution;
    const order: Channel[] = ['dirt', 'stone', 'shade', 'nograss'];
    order.forEach((ch, c) => {
      const img = this.canvases.get(ch)!.getImageData(0, 0, n, n).data;
      const plane = new Uint8Array(n * n);
      for (let i = 0; i < n * n; i++) plane[i] = img[i * 4]!;
      boxBlur(plane, n, ch === 'shade' ? 3 : 2);
      for (let i = 0; i < n * n; i++) this.data[i * 4 + c] = plane[i]!;
    });
    this.texture.needsUpdate = true;
  }

  /** CPU lookup (nearest texel) used for footstep surfaces and placement rules. */
  sample(x: number, z: number): { dirt: number; stone: number; shade: number; nograss: number } {
    const n = this.resolution;
    const i = Math.min(n - 1, Math.max(0, Math.floor(this.px(x))));
    const j = Math.min(n - 1, Math.max(0, Math.floor(this.px(z))));
    const o = (j * n + i) * 4;
    return {
      dirt: this.data[o]! / 255,
      stone: this.data[o + 1]! / 255,
      shade: this.data[o + 2]! / 255,
      nograss: this.data[o + 3]! / 255,
    };
  }
}

/** Two-pass separable box blur in place. */
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
  for (let x = 0; x < n; x++) {
    let acc = 0;
    for (let y = -radius; y <= radius; y++) acc += tmp[Math.min(n - 1, Math.max(0, y)) * n + x]!;
    for (let y = 0; y < n; y++) {
      src[y * n + x] = acc / w;
      const add = tmp[Math.min(n - 1, y + radius + 1) * n + x]!;
      const sub = tmp[Math.max(0, y - radius) * n + x]!;
      acc += add - sub;
    }
  }
}
