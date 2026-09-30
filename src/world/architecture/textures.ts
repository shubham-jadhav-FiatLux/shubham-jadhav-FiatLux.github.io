import { CanvasTexture, SRGBColorSpace } from 'three';
import { roundRectPath } from '../../utils/canvas';

export const BRUSH_FONT = "'Brush', 'Ma Shan Zheng', 'KaiTi', serif";
export const SERIF_FONT = "'Cormorant Garamond', Georgia, serif";

function tex(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Shrinks the font until `text` fits `maxWidth`. */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  size: number,
  family: string,
  weight = '400',
): number {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    s -= 2;
  } while (s > 8);
  return s;
}

/** Gilded signboard for the gate: dark lacquer, gold frame, brush glyphs. */
export function createSignboardTexture(glyphs: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 320;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, '#22395a');
  g.addColorStop(1, '#172841');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#d6aa4a';
  ctx.lineWidth = 18;
  ctx.strokeRect(9, 9, c.width - 18, c.height - 18);
  ctx.lineWidth = 4;
  ctx.strokeRect(34, 34, c.width - 68, c.height - 68);
  ctx.fillStyle = '#e9c46a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, glyphs, c.width - 120, 190, BRUSH_FONT);
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 6;
  ctx.fillText(glyphs.split('').join(' '), c.width / 2, c.height / 2 + 8);
  return tex(c);
}

export interface BannerSpec {
  number: string;
  title: string;
}

/** One atlas with a column per project banner: seal numeral on top, brush title below. */
export function createBannerAtlas(banners: BannerSpec[]): CanvasTexture {
  const w = 256;
  const h = 704;
  const c = document.createElement('canvas');
  c.width = w * Math.max(1, banners.length);
  c.height = h;
  const ctx = c.getContext('2d')!;
  banners.forEach((b, i) => {
    const x0 = i * w;
    // cloth with a subtle weave and darker borders
    const cloth = ctx.createLinearGradient(x0, 0, x0 + w, 0);
    const base =
      i % 2 === 0 ? ['#b83a2c', '#c9493a', '#b83a2c'] : ['#1f5a5c', '#2a6f70', '#1f5a5c'];
    cloth.addColorStop(0, base[0]!);
    cloth.addColorStop(0.5, base[1]!);
    cloth.addColorStop(1, base[2]!);
    ctx.fillStyle = cloth;
    ctx.fillRect(x0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let y = 0; y < h; y += 6) ctx.fillRect(x0, y, w, 2);
    ctx.strokeStyle = '#e8c56d';
    ctx.lineWidth = 8;
    ctx.strokeRect(x0 + 14, 14, w - 28, h - 28);
    // swallowtail notch at the bottom
    ctx.fillStyle = '#000';
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(x0 + w * 0.25, h);
    ctx.lineTo(x0 + w * 0.5, h - 70);
    ctx.lineTo(x0 + w * 0.75, h);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // numeral seal
    ctx.fillStyle = '#f3ead6';
    ctx.fillRect(x0 + w / 2 - 62, 52, 124, 124);
    ctx.fillStyle = base[0]!;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `100px ${BRUSH_FONT}`;
    ctx.fillText(b.number, x0 + w / 2, 118);
    // title, wrapped onto up to three lines
    ctx.fillStyle = '#f7ecd4';
    const words = b.title.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    ctx.font = `64px ${BRUSH_FONT}`;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > w - 50 && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    if (line) lines.push(line);
    const shown = lines.slice(0, 3);
    const size = Math.min(64, ...shown.map((l) => fitText(ctx, l, w - 50, 64, BRUSH_FONT)));
    ctx.font = `${size}px ${BRUSH_FONT}`;
    shown.forEach((l, k) => ctx.fillText(l, x0 + w / 2, 300 + k * (size + 14)));
  });
  return tex(c);
}

/** Wooden signpost arrows (one row per destination). */
export function createSignpostTexture(labels: string[]): CanvasTexture {
  const w = 512;
  const rowH = 96;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = rowH * labels.length;
  const ctx = c.getContext('2d')!;
  labels.forEach((label, i) => {
    const y = i * rowH;
    const g = ctx.createLinearGradient(0, y, 0, y + rowH);
    g.addColorStop(0, '#8a5f3f');
    g.addColorStop(1, '#6b4630');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, w, rowH);
    ctx.strokeStyle = 'rgba(40, 20, 10, 0.35)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.moveTo(0, y + 12 + k * 18 + Math.sin(k) * 3);
      ctx.bezierCurveTo(w * 0.3, y + 8 + k * 18, w * 0.6, y + 18 + k * 18, w, y + 12 + k * 18);
      ctx.stroke();
    }
    ctx.fillStyle = '#f3e3c3';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, label, w - 70, 50, SERIF_FONT, '700');
    ctx.fillText(label, w / 2, y + rowH / 2 + 2);
  });
  return tex(c);
}

/** Text label drawn on a transparent canvas (used for floating in-world captions). */
export function createLabelTexture(title: string, subtitle?: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 192;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(243, 234, 214, 0.92)';
  const r = 26;
  ctx.beginPath();
  roundRectPath(ctx, 8, 8, c.width - 16, c.height - 16, r);
  ctx.fill();
  ctx.strokeStyle = '#b8352b';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#1e1a18';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, title, c.width - 70, 58, BRUSH_FONT);
  ctx.fillText(title, c.width / 2, subtitle ? 78 : c.height / 2);
  if (subtitle) {
    ctx.fillStyle = '#6b4e3a';
    fitText(ctx, subtitle, c.width - 70, 34, SERIF_FONT, '700');
    ctx.fillText(subtitle, c.width / 2, 135);
  }
  return tex(c);
}
