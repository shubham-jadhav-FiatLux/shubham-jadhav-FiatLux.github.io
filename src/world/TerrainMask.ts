import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import { sj_TERRAIN_ORIGIN, sj_TERRAIN_SIZE, type Vec2 } from './layout';

/**
 * Paintable layers of the ground. The first four pack into the main splat map, the
 * others into a second "detail" map:
 *   main:   R = dirt paths, G = stone paving, B = soft shade, A = grass suppression
 *   detail: R = warm lantern light, G = wet ground, B = leaf litter, A = gravel / stream bed
 */
export type Channel =
  'dirt' | 'stone' | 'shade' | 'nograss' | 'light' | 'wet' | 'litter' | 'gravel';

const sj_MAIN: readonly Channel[] = ['dirt', 'stone', 'shade', 'nograss'];
const sj_DETAIL: readonly Channel[] = ['light', 'wet', 'litter', 'gravel'];
const sj_BLUR: Record<Channel, number> = {
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

  constructor(sj_resolution = 1024) {
    this.resolution = sj_resolution;
    for (const sj_ch of [...sj_MAIN, ...sj_DETAIL]) {
      const sj_canvas = document.createElement('canvas');
      sj_canvas.width = sj_canvas.height = sj_resolution;
      const sj_ctx = sj_canvas.getContext('2d', { willReadFrequently: true })!;
      sj_ctx.fillStyle = '#000';
      sj_ctx.fillRect(0, 0, sj_resolution, sj_resolution);
      this.canvases.set(sj_ch, sj_ctx);
    }
    this.data = new Uint8Array(sj_resolution * sj_resolution * 4);
    this.texture = this.makeTexture(this.data);
    this.detailData = new Uint8Array(sj_resolution * sj_resolution * 4);
    this.detailTexture = this.makeTexture(this.detailData);
  }

  private makeTexture(sj_data: Uint8Array): DataTexture {
    const sj_n = this.resolution;
    const sj_tex = new DataTexture(sj_data, sj_n, sj_n, RGBAFormat, UnsignedByteType);
    sj_tex.magFilter = LinearFilter;
    sj_tex.minFilter = LinearMipmapLinearFilter;
    sj_tex.generateMipmaps = true;
    sj_tex.anisotropy = 4;
    return sj_tex;
  }

  private px(sj_v: number): number {
    return ((sj_v - sj_TERRAIN_ORIGIN) / sj_TERRAIN_SIZE) * this.resolution;
  }

  private metres(sj_m: number): number {
    return (sj_m / sj_TERRAIN_SIZE) * this.resolution;
  }

  private ctx(sj_ch: Channel, sj_strength: number): CanvasRenderingContext2D {
    const sj_ctx = this.canvases.get(sj_ch)!;
    const sj_v = Math.round(Math.min(1, Math.max(0, sj_strength)) * 255);
    sj_ctx.fillStyle = sj_ctx.strokeStyle = `rgb(${sj_v},${sj_v},${sj_v})`;
    return sj_ctx;
  }

  path(
    sj_points: readonly Vec2[],
    sj_width: number,
    sj_channel: Channel = 'dirt',
    sj_strength = 1,
  ): void {
    const sj_ctx = this.ctx(sj_channel, sj_strength);
    sj_ctx.globalCompositeOperation = 'lighten';
    sj_ctx.lineCap = 'round';
    sj_ctx.lineJoin = 'round';
    sj_ctx.lineWidth = this.metres(sj_width);
    sj_ctx.beginPath();
    sj_points.forEach(([sj_x, sj_z], sj_i) => {
      if (sj_i === 0) sj_ctx.moveTo(this.px(sj_x), this.px(sj_z));
      else sj_ctx.lineTo(this.px(sj_x), this.px(sj_z));
    });
    sj_ctx.stroke();
    sj_ctx.globalCompositeOperation = 'source-over';
  }

  circle(
    sj_channel: Channel,
    sj_x: number,
    sj_z: number,
    sj_radius: number,
    sj_strength = 1,
  ): void {
    const sj_ctx = this.ctx(sj_channel, sj_strength);
    sj_ctx.globalCompositeOperation = 'lighten';
    sj_ctx.beginPath();
    sj_ctx.arc(this.px(sj_x), this.px(sj_z), this.metres(sj_radius), 0, Math.PI * 2);
    sj_ctx.fill();
    sj_ctx.globalCompositeOperation = 'source-over';
  }

  /** Soft radial blob, e.g. the shade under a tree canopy. */
  blob(sj_channel: Channel, sj_x: number, sj_z: number, sj_radius: number, sj_strength = 1): void {
    const sj_ctx = this.canvases.get(sj_channel)!;
    const sj_cx = this.px(sj_x);
    const sj_cz = this.px(sj_z);
    const sj_r = this.metres(sj_radius);
    const sj_v = Math.round(Math.min(1, sj_strength) * 255);
    const sj_g = sj_ctx.createRadialGradient(sj_cx, sj_cz, 0, sj_cx, sj_cz, sj_r);
    sj_g.addColorStop(0, `rgb(${sj_v},${sj_v},${sj_v})`);
    sj_g.addColorStop(1, 'rgb(0,0,0)');
    sj_ctx.globalCompositeOperation = 'lighten';
    sj_ctx.fillStyle = sj_g;
    sj_ctx.fillRect(sj_cx - sj_r, sj_cz - sj_r, sj_r * 2, sj_r * 2);
    sj_ctx.globalCompositeOperation = 'source-over';
  }

  /** Oriented rectangle, e.g. a building footprint. */
  rect(
    sj_channel: Channel,
    sj_x: number,
    sj_z: number,
    sj_halfX: number,
    sj_halfZ: number,
    sj_rotation = 0,
    sj_strength = 1,
  ): void {
    const sj_ctx = this.ctx(sj_channel, sj_strength);
    sj_ctx.save();
    sj_ctx.globalCompositeOperation = 'lighten';
    sj_ctx.translate(this.px(sj_x), this.px(sj_z));
    sj_ctx.rotate(-sj_rotation);
    sj_ctx.fillRect(
      -this.metres(sj_halfX),
      -this.metres(sj_halfZ),
      this.metres(sj_halfX * 2),
      this.metres(sj_halfZ * 2),
    );
    sj_ctx.restore();
  }

  /**
   * Paints a value computed per texel (0..1) inside a world-space box, keeping the
   * larger of old and new, e.g. grass suppression on steep ground.
   */
  field(
    sj_channel: Channel,
    sj_box: { x0: number; z0: number; x1: number; z1: number },
    sj_value: (sj_x: number, sj_z: number) => number,
  ): void {
    const sj_ctx = this.canvases.get(sj_channel)!;
    const sj_n = this.resolution;
    const sj_i0 = Math.max(0, Math.floor(this.px(sj_box.x0)));
    const sj_j0 = Math.max(0, Math.floor(this.px(sj_box.z0)));
    const sj_i1 = Math.min(sj_n, Math.ceil(this.px(sj_box.x1)));
    const sj_j1 = Math.min(sj_n, Math.ceil(this.px(sj_box.z1)));
    if (sj_i1 <= sj_i0 || sj_j1 <= sj_j0) return;
    const sj_img = sj_ctx.getImageData(sj_i0, sj_j0, sj_i1 - sj_i0, sj_j1 - sj_j0);
    const sj_texel = sj_TERRAIN_SIZE / sj_n;
    for (let sj_j = sj_j0; sj_j < sj_j1; sj_j++) {
      const sj_z = sj_TERRAIN_ORIGIN + (sj_j + 0.5) * sj_texel;
      for (let sj_i = sj_i0; sj_i < sj_i1; sj_i++) {
        const sj_x = sj_TERRAIN_ORIGIN + (sj_i + 0.5) * sj_texel;
        const sj_v = Math.round(Math.min(1, Math.max(0, sj_value(sj_x, sj_z))) * 255);
        const sj_o = ((sj_j - sj_j0) * (sj_i1 - sj_i0) + (sj_i - sj_i0)) * 4;
        if (sj_v > sj_img.data[sj_o]!)
          sj_img.data[sj_o] = sj_img.data[sj_o + 1] = sj_img.data[sj_o + 2] = sj_v;
      }
    }
    sj_ctx.putImageData(sj_img, sj_i0, sj_j0);
  }

  /** Packs all channels into the textures (with a light blur for soft edges). */
  commit(): void {
    const sj_n = this.resolution;
    const sj_pack = (sj_order: readonly Channel[], sj_out: Uint8Array) => {
      sj_order.forEach((sj_ch, sj_c) => {
        const sj_img = this.canvases.get(sj_ch)!.getImageData(0, 0, sj_n, sj_n).data;
        const sj_plane = new Uint8Array(sj_n * sj_n);
        for (let sj_i = 0; sj_i < sj_n * sj_n; sj_i++) sj_plane[sj_i] = sj_img[sj_i * 4]!;
        boxBlur(sj_plane, sj_n, sj_BLUR[sj_ch]);
        for (let sj_i = 0; sj_i < sj_n * sj_n; sj_i++) sj_out[sj_i * 4 + sj_c] = sj_plane[sj_i]!;
      });
    };
    sj_pack(sj_MAIN, this.data);
    sj_pack(sj_DETAIL, this.detailData);
    this.texture.needsUpdate = true;
    this.detailTexture.needsUpdate = true;
  }

  private index(sj_x: number, sj_z: number): number {
    const sj_n = this.resolution;
    const sj_i = Math.min(sj_n - 1, Math.max(0, Math.floor(this.px(sj_x))));
    const sj_j = Math.min(sj_n - 1, Math.max(0, Math.floor(this.px(sj_z))));
    return (sj_j * sj_n + sj_i) * 4;
  }

  /** CPU lookup (nearest texel) used for footstep surfaces and placement rules. */
  sample(
    sj_x: number,
    sj_z: number,
  ): { dirt: number; stone: number; shade: number; nograss: number } {
    const sj_o = this.index(sj_x, sj_z);
    return {
      dirt: this.data[sj_o]! / 255,
      stone: this.data[sj_o + 1]! / 255,
      shade: this.data[sj_o + 2]! / 255,
      nograss: this.data[sj_o + 3]! / 255,
    };
  }

  sampleDetail(
    sj_x: number,
    sj_z: number,
  ): { light: number; wet: number; litter: number; gravel: number } {
    const sj_o = this.index(sj_x, sj_z);
    return {
      light: this.detailData[sj_o]! / 255,
      wet: this.detailData[sj_o + 1]! / 255,
      litter: this.detailData[sj_o + 2]! / 255,
      gravel: this.detailData[sj_o + 3]! / 255,
    };
  }
}

/**
 * Two-pass separable box blur in place, using running sums. The vertical pass keeps one
 * running sum per column and walks the image row by row, so memory is read in order
 * (stepping down each column in turn is several times slower on a 1024² map).
 */
function boxBlur(sj_src: Uint8Array, sj_n: number, sj_radius: number): void {
  if (sj_radius <= 0) return;
  const sj_tmp = new Uint8Array(sj_n * sj_n);
  const sj_w = sj_radius * 2 + 1;
  for (let sj_y = 0; sj_y < sj_n; sj_y++) {
    let sj_acc = 0;
    const sj_row = sj_y * sj_n;
    for (let sj_x = -sj_radius; sj_x <= sj_radius; sj_x++)
      sj_acc += sj_src[sj_row + Math.min(sj_n - 1, Math.max(0, sj_x))]!;
    for (let sj_x = 0; sj_x < sj_n; sj_x++) {
      sj_tmp[sj_row + sj_x] = sj_acc / sj_w;
      const sj_add = sj_src[sj_row + Math.min(sj_n - 1, sj_x + sj_radius + 1)]!;
      const sj_sub = sj_src[sj_row + Math.max(0, sj_x - sj_radius)]!;
      sj_acc += sj_add - sj_sub;
    }
  }
  const sj_acc = new Int32Array(sj_n);
  for (let sj_y = -sj_radius; sj_y <= sj_radius; sj_y++) {
    const sj_row = Math.min(sj_n - 1, Math.max(0, sj_y)) * sj_n;
    for (let sj_x = 0; sj_x < sj_n; sj_x++) sj_acc[sj_x]! += sj_tmp[sj_row + sj_x]!;
  }
  for (let sj_y = 0; sj_y < sj_n; sj_y++) {
    const sj_row = sj_y * sj_n;
    const sj_addRow = Math.min(sj_n - 1, sj_y + sj_radius + 1) * sj_n;
    const sj_subRow = Math.max(0, sj_y - sj_radius) * sj_n;
    for (let sj_x = 0; sj_x < sj_n; sj_x++) {
      sj_src[sj_row + sj_x] = sj_acc[sj_x]! / sj_w;
      sj_acc[sj_x]! += sj_tmp[sj_addRow + sj_x]! - sj_tmp[sj_subRow + sj_x]!;
    }
  }
}
