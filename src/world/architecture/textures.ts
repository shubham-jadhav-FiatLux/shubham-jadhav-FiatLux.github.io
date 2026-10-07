import { CanvasTexture, SRGBColorSpace } from 'three';
import { roundRectPath } from '../../utils/canvas';

export const sj_BRUSH_FONT = "'Brush', 'Ma Shan Zheng', 'KaiTi', serif";
/** A sturdy serif for small lettering that has to read from a distance (used at 700). */
export const sj_INSCRIPTION_FONT = "'Lora', Georgia, serif";

/**
 * A canvas `sj_w` x `sj_h` (drawing units) stored at `sj_scale` times that resolution: drawing code
 * keeps its coordinates and the texture costs less memory on lower quality levels.
 */
function canvas(sj_w: number, sj_h: number, sj_scale: number) {
  const sj_c = document.createElement('canvas');
  sj_c.width = Math.max(1, Math.round(sj_w * sj_scale));
  sj_c.height = Math.max(1, Math.round(sj_h * sj_scale));
  const sj_ctx = sj_c.getContext('2d')!;
  sj_ctx.scale(sj_c.width / sj_w, sj_c.height / sj_h);
  return { c: sj_c, ctx: sj_ctx };
}

function tex(sj_c: HTMLCanvasElement): CanvasTexture {
  const sj_t = new CanvasTexture(sj_c);
  sj_t.colorSpace = SRGBColorSpace;
  sj_t.anisotropy = 4;
  sj_t.needsUpdate = true;
  return sj_t;
}

/** Shrinks the font until `sj_text` fits `sj_maxWidth`. */
export function fitText(
  sj_ctx: CanvasRenderingContext2D,
  sj_text: string,
  sj_maxWidth: number,
  sj_size: number,
  sj_family: string,
  sj_weight = '400',
): number {
  let sj_s = sj_size;
  do {
    sj_ctx.font = `${sj_weight} ${sj_s}px ${sj_family}`;
    if (sj_ctx.measureText(sj_text).width <= sj_maxWidth) break;
    sj_s -= 2;
  } while (sj_s > 8);
  return sj_s;
}

/**
 * Lettering that reads from afar: the letters thickened (stroked in their own colour) and,
 * optionally, set inside a contrasting outline. Sizes are fractions of the font size.
 */
export function boldText(
  sj_ctx: CanvasRenderingContext2D,
  sj_text: string,
  sj_x: number,
  sj_y: number,
  sj_size: number,
  sj_o: { fill: string; outline?: string; edge?: number; thicken?: number },
): void {
  sj_ctx.save();
  sj_ctx.lineJoin = 'round';
  sj_ctx.miterLimit = 2;
  if (sj_o.outline) {
    sj_ctx.strokeStyle = sj_o.outline;
    sj_ctx.lineWidth = sj_size * (sj_o.edge ?? 0.16);
    sj_ctx.strokeText(sj_text, sj_x, sj_y);
  }
  sj_ctx.strokeStyle = sj_o.fill;
  sj_ctx.lineWidth = sj_size * (sj_o.thicken ?? 0.05);
  sj_ctx.strokeText(sj_text, sj_x, sj_y);
  sj_ctx.fillStyle = sj_o.fill;
  sj_ctx.fillText(sj_text, sj_x, sj_y);
  sj_ctx.restore();
}

/** Gilded signboard for the gate: dark lacquer, gold frame, brush glyphs. */
export function createSignboardTexture(sj_glyphs: string): CanvasTexture {
  const sj_c = document.createElement('canvas');
  sj_c.width = 768;
  sj_c.height = 320;
  const sj_ctx = sj_c.getContext('2d')!;
  const sj_g = sj_ctx.createLinearGradient(0, 0, 0, sj_c.height);
  sj_g.addColorStop(0, '#22395a');
  sj_g.addColorStop(1, '#172841');
  sj_ctx.fillStyle = sj_g;
  sj_ctx.fillRect(0, 0, sj_c.width, sj_c.height);
  sj_ctx.strokeStyle = '#d6aa4a';
  sj_ctx.lineWidth = 18;
  sj_ctx.strokeRect(9, 9, sj_c.width - 18, sj_c.height - 18);
  sj_ctx.lineWidth = 4;
  sj_ctx.strokeRect(34, 34, sj_c.width - 68, sj_c.height - 68);
  sj_ctx.textAlign = 'center';
  sj_ctx.textBaseline = 'middle';
  const sj_spaced = sj_glyphs.split('').join(' ');
  const sj_size = fitText(sj_ctx, sj_spaced, sj_c.width - 130, 190, sj_BRUSH_FONT);
  sj_ctx.shadowColor = 'rgba(0,0,0,0.35)';
  sj_ctx.shadowBlur = 6;
  boldText(sj_ctx, sj_spaced, sj_c.width / 2, sj_c.height / 2 + 8, sj_size, {
    fill: '#f2cf6e',
    outline: '#0e1a2c',
    edge: 0.1,
    thicken: 0.05,
  });
  return tex(sj_c);
}

export interface BannerSpec {
  number: string;
  title: string;
}

/** One atlas with a column per project banner: seal numeral on top, brush title below. */
export function createBannerAtlas(sj_banners: BannerSpec[], sj_scale = 1): CanvasTexture {
  const sj_w = 384;
  const sj_h = 1056;
  const { c: sj_c, ctx: sj_ctx } = canvas(sj_w * Math.max(1, sj_banners.length), sj_h, sj_scale);
  sj_banners.forEach((sj_b, sj_i) => {
    const sj_x0 = sj_i * sj_w;
    // cloth with a subtle weave and darker borders
    const sj_cloth = sj_ctx.createLinearGradient(sj_x0, 0, sj_x0 + sj_w, 0);
    const sj_base =
      sj_i % 2 === 0 ? ['#b83a2c', '#c9493a', '#b83a2c'] : ['#1f5a5c', '#2a6f70', '#1f5a5c'];
    sj_cloth.addColorStop(0, sj_base[0]!);
    sj_cloth.addColorStop(0.5, sj_base[1]!);
    sj_cloth.addColorStop(1, sj_base[2]!);
    sj_ctx.fillStyle = sj_cloth;
    sj_ctx.fillRect(sj_x0, 0, sj_w, sj_h);
    sj_ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let sj_y = 0; sj_y < sj_h; sj_y += 6) sj_ctx.fillRect(sj_x0, sj_y, sj_w, 2);
    sj_ctx.strokeStyle = '#e8c56d';
    sj_ctx.lineWidth = 12;
    sj_ctx.strokeRect(sj_x0 + 21, 21, sj_w - 42, sj_h - 42);
    // swallowtail notch at the bottom
    sj_ctx.fillStyle = '#000';
    sj_ctx.globalCompositeOperation = 'destination-out';
    sj_ctx.beginPath();
    sj_ctx.moveTo(sj_x0 + sj_w * 0.25, sj_h);
    sj_ctx.lineTo(sj_x0 + sj_w * 0.5, sj_h - 105);
    sj_ctx.lineTo(sj_x0 + sj_w * 0.75, sj_h);
    sj_ctx.closePath();
    sj_ctx.fill();
    sj_ctx.globalCompositeOperation = 'source-over';
    // numeral seal
    sj_ctx.fillStyle = '#f3ead6';
    sj_ctx.fillRect(sj_x0 + sj_w / 2 - 93, 78, 186, 186);
    sj_ctx.fillStyle = sj_base[0]!;
    sj_ctx.textAlign = 'center';
    sj_ctx.textBaseline = 'middle';
    sj_ctx.font = `150px ${sj_BRUSH_FONT}`;
    sj_ctx.fillText(sj_b.number, sj_x0 + sj_w / 2, 177);
    // title, wrapped onto up to three lines, with a dark edge so it reads from afar
    const sj_words = sj_b.title.split(/\s+/);
    const sj_lines: string[] = [];
    let sj_line = '';
    sj_ctx.font = `104px ${sj_BRUSH_FONT}`;
    for (const sj_word of sj_words) {
      const sj_test = sj_line ? `${sj_line} ${sj_word}` : sj_word;
      if (sj_ctx.measureText(sj_test).width > sj_w - 64 && sj_line) {
        sj_lines.push(sj_line);
        sj_line = sj_word;
      } else sj_line = sj_test;
    }
    if (sj_line) sj_lines.push(sj_line);
    const sj_shown = sj_lines.slice(0, 3);
    const sj_size = Math.min(
      104,
      ...sj_shown.map((sj_l) => fitText(sj_ctx, sj_l, sj_w - 64, 104, sj_BRUSH_FONT)),
    );
    sj_ctx.font = `${sj_size}px ${sj_BRUSH_FONT}`;
    sj_shown.forEach((sj_l, sj_k) => {
      const sj_y = 430 + sj_k * (sj_size + 22);
      boldText(sj_ctx, sj_l, sj_x0 + sj_w / 2, sj_y, sj_size, {
        fill: '#fff6e4',
        outline: 'rgba(24, 10, 6, 0.85)',
        edge: 0.17,
        thicken: 0.05,
      });
    });
  });
  return tex(sj_c);
}

/**
 * Wooden signpost arrows, one row per destination: the section in large letters, the
 * place it is found below.
 */
export function createSignpostTexture(
  sj_rows: { title: string; place: string }[],
  sj_scale = 1,
): CanvasTexture {
  const sj_w = 1024;
  // rows match the boards' proportions (2.1 x 0.48 m)
  const sj_rowH = 234;
  const { c: sj_c, ctx: sj_ctx } = canvas(sj_w, sj_rowH * Math.max(1, sj_rows.length), sj_scale);
  sj_rows.forEach((sj_row, sj_i) => {
    const sj_y = sj_i * sj_rowH;
    // dark, oiled wood so pale letters stand out
    const sj_g = sj_ctx.createLinearGradient(0, sj_y, 0, sj_y + sj_rowH);
    sj_g.addColorStop(0, '#5a3a25');
    sj_g.addColorStop(1, '#3c2617');
    sj_ctx.fillStyle = sj_g;
    sj_ctx.fillRect(0, sj_y, sj_w, sj_rowH);
    sj_ctx.strokeStyle = 'rgba(20, 10, 4, 0.35)';
    sj_ctx.lineWidth = 3;
    for (let sj_k = 0; sj_k < 6; sj_k++) {
      sj_ctx.beginPath();
      sj_ctx.moveTo(0, sj_y + 22 + sj_k * 38 + Math.sin(sj_k) * 5);
      sj_ctx.bezierCurveTo(
        sj_w * 0.3,
        sj_y + 16 + sj_k * 38,
        sj_w * 0.6,
        sj_y + 32 + sj_k * 38,
        sj_w,
        sj_y + 22 + sj_k * 38,
      );
      sj_ctx.stroke();
    }
    // a painted border, like the frame of a shop sign
    sj_ctx.strokeStyle = 'rgba(236, 199, 121, 0.55)';
    sj_ctx.lineWidth = 6;
    sj_ctx.strokeRect(14, sj_y + 14, sj_w - 28, sj_rowH - 28);
    sj_ctx.textAlign = 'center';
    sj_ctx.textBaseline = 'middle';
    // big brush title in cream paint, thick, with a dark edge
    const sj_title = fitText(sj_ctx, sj_row.title, sj_w - 150, 154, sj_BRUSH_FONT);
    boldText(sj_ctx, sj_row.title, sj_w / 2, sj_y + 98, sj_title, {
      fill: '#fff4dc',
      outline: 'rgba(18, 8, 2, 0.8)',
      edge: 0.14,
      thicken: 0.06,
    });
    const sj_place = fitText(sj_ctx, sj_row.place, sj_w - 170, 54, sj_INSCRIPTION_FONT, '700');
    boldText(sj_ctx, sj_row.place, sj_w / 2, sj_y + 191, sj_place, {
      fill: '#f6d27c',
      outline: 'rgba(18, 8, 2, 0.75)',
      edge: 0.16,
      thicken: 0.03,
    });
  });
  return tex(sj_c);
}

/** Text label drawn on a transparent canvas (used for floating in-world captions). */
export function createLabelTexture(
  sj_title: string,
  sj_subtitle?: string,
  sj_scale = 1,
): CanvasTexture {
  const sj_W = 1024;
  const sj_H = 384;
  const { c: sj_c, ctx: sj_ctx } = canvas(sj_W, sj_H, sj_scale);
  sj_ctx.fillStyle = 'rgba(246, 238, 220, 0.95)';
  sj_ctx.beginPath();
  roundRectPath(sj_ctx, 14, 14, sj_W - 28, sj_H - 28, 52);
  sj_ctx.fill();
  sj_ctx.strokeStyle = '#b8352b';
  sj_ctx.lineWidth = 11;
  sj_ctx.stroke();
  sj_ctx.textAlign = 'center';
  sj_ctx.textBaseline = 'middle';
  const sj_size = fitText(sj_ctx, sj_title, sj_W - 120, sj_subtitle ? 134 : 156, sj_BRUSH_FONT);
  boldText(sj_ctx, sj_title, sj_W / 2, sj_subtitle ? 146 : sj_H / 2, sj_size, {
    fill: '#14100d',
    thicken: 0.05,
  });
  if (sj_subtitle) {
    const sj_small = fitText(sj_ctx, sj_subtitle, sj_W - 120, 78, sj_INSCRIPTION_FONT, '700');
    boldText(sj_ctx, sj_subtitle, sj_W / 2, 274, sj_small, { fill: '#1c1714', thicken: 0.03 });
  }
  return tex(sj_c);
}
