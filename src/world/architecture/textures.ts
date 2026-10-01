import { CanvasTexture, SRGBColorSpace } from 'three';
import { roundRectPath } from '../../utils/canvas';

export const BRUSH_FONT = "'Brush', 'Ma Shan Zheng', 'KaiTi', serif";
export const SERIF_FONT = "'Cormorant Garamond', Georgia, serif";

/**
 * A canvas `w` x `h` (drawing units) stored at `scale` times that resolution: drawing code
 * keeps its coordinates and the texture costs less memory on lower quality levels.
 */
function canvas(w: number, h: number, scale: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext('2d')!;
  ctx.scale(c.width / w, c.height / h);
  return { c, ctx };
}

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
export function createBannerAtlas(banners: BannerSpec[], scale = 1): CanvasTexture {
  const w = 384;
  const h = 1056;
  const { c, ctx } = canvas(w * Math.max(1, banners.length), h, scale);
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
    ctx.lineWidth = 12;
    ctx.strokeRect(x0 + 21, 21, w - 42, h - 42);
    // swallowtail notch at the bottom
    ctx.fillStyle = '#000';
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(x0 + w * 0.25, h);
    ctx.lineTo(x0 + w * 0.5, h - 105);
    ctx.lineTo(x0 + w * 0.75, h);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // numeral seal
    ctx.fillStyle = '#f3ead6';
    ctx.fillRect(x0 + w / 2 - 93, 78, 186, 186);
    ctx.fillStyle = base[0]!;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `150px ${BRUSH_FONT}`;
    ctx.fillText(b.number, x0 + w / 2, 177);
    // title, wrapped onto up to three lines, with a dark edge so it reads from afar
    const words = b.title.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    ctx.font = `104px ${BRUSH_FONT}`;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > w - 64 && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    if (line) lines.push(line);
    const shown = lines.slice(0, 3);
    const size = Math.min(104, ...shown.map((l) => fitText(ctx, l, w - 64, 104, BRUSH_FONT)));
    ctx.font = `${size}px ${BRUSH_FONT}`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(6, size * 0.12);
    ctx.strokeStyle = 'rgba(20, 10, 6, 0.55)';
    ctx.fillStyle = '#fbf1da';
    shown.forEach((l, k) => {
      const y = 430 + k * (size + 22);
      ctx.strokeText(l, x0 + w / 2, y);
      ctx.fillText(l, x0 + w / 2, y);
    });
  });
  return tex(c);
}

/**
 * Wooden signpost arrows, one row per destination: the section in large letters, the
 * place it is found below.
 */
export function createSignpostTexture(
  rows: { title: string; place: string }[],
  scale = 1,
): CanvasTexture {
  const w = 1024;
  // rows match the boards' proportions (2.1 x 0.48 m)
  const rowH = 234;
  const { c, ctx } = canvas(w, rowH * Math.max(1, rows.length), scale);
  rows.forEach((row, i) => {
    const y = i * rowH;
    const g = ctx.createLinearGradient(0, y, 0, y + rowH);
    g.addColorStop(0, '#8a5f3f');
    g.addColorStop(1, '#6b4630');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, w, rowH);
    ctx.strokeStyle = 'rgba(40, 20, 10, 0.35)';
    ctx.lineWidth = 3;
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      ctx.moveTo(0, y + 22 + k * 38 + Math.sin(k) * 5);
      ctx.bezierCurveTo(w * 0.3, y + 16 + k * 38, w * 0.6, y + 32 + k * 38, w, y + 22 + k * 38);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    // carved look: a dark edge under pale letters
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(40, 20, 10, 0.55)';
    ctx.fillStyle = '#fbefd4';
    fitText(ctx, row.title, w - 120, 128, SERIF_FONT, '700');
    ctx.strokeText(row.title, w / 2, y + 96);
    ctx.fillText(row.title, w / 2, y + 96);
    ctx.fillStyle = '#ecc779';
    ctx.lineWidth = 6;
    fitText(ctx, row.place, w - 140, 58, SERIF_FONT, '700');
    ctx.strokeText(row.place, w / 2, y + 186);
    ctx.fillText(row.place, w / 2, y + 186);
  });
  return tex(c);
}

/** Text label drawn on a transparent canvas (used for floating in-world captions). */
export function createLabelTexture(title: string, subtitle?: string, scale = 1): CanvasTexture {
  const W = 1024;
  const H = 384;
  const { c, ctx } = canvas(W, H, scale);
  ctx.fillStyle = 'rgba(246, 238, 220, 0.95)';
  ctx.beginPath();
  roundRectPath(ctx, 14, 14, W - 28, H - 28, 52);
  ctx.fill();
  ctx.strokeStyle = '#b8352b';
  ctx.lineWidth = 11;
  ctx.stroke();
  ctx.fillStyle = '#1a1614';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, title, W - 120, subtitle ? 128 : 150, BRUSH_FONT);
  ctx.fillText(title, W / 2, subtitle ? 150 : H / 2);
  if (subtitle) {
    ctx.fillStyle = '#5c4130';
    fitText(ctx, subtitle, W - 120, 70, SERIF_FONT, '700');
    ctx.fillText(subtitle, W / 2, 272);
  }
  return tex(c);
}
