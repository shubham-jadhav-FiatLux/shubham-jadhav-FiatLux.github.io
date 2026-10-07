import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { Random } from '../../utils/random';

/**
 * Procedural canopy textures painted with Canvas 2D. Each is a round-ish "clump" of
 * blossoms, leaves or needles with transparent surroundings, used on alpha-tested cards.
 */

function canvas(sj_w: number, sj_h = sj_w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const sj_c = document.createElement('canvas');
  sj_c.width = sj_w;
  sj_c.height = sj_h;
  return [sj_c, sj_c.getContext('2d')!];
}

function toTexture(sj_c: HTMLCanvasElement): CanvasTexture {
  const sj_t = new CanvasTexture(sj_c);
  sj_t.colorSpace = SRGBColorSpace;
  sj_t.minFilter = LinearMipmapLinearFilter;
  sj_t.anisotropy = 4;
  sj_t.needsUpdate = true;
  return sj_t;
}

/** Random point inside a lumpy disc (so the clump silhouette is irregular). */
function lumpyPoint(
  sj_rand: Random,
  sj_cx: number,
  sj_cy: number,
  sj_radius: number,
): [number, number] {
  for (;;) {
    const sj_x = sj_rand.range(-1, 1);
    const sj_y = sj_rand.range(-1, 1);
    const sj_a = Math.atan2(sj_y, sj_x);
    const sj_lump = 0.78 + 0.22 * Math.sin(sj_a * 5 + 1.3) * Math.cos(sj_a * 3 - 0.4);
    if (sj_x * sj_x + sj_y * sj_y < sj_lump * sj_lump)
      return [sj_cx + sj_x * sj_radius, sj_cy + sj_y * sj_radius];
  }
}

export function createBlossomTexture(
  sj_palette = ['#fbd3e0', '#f6b3c9', '#f29ab7', '#fde9ef', '#ee8fae'],
) {
  const sj_size = 256;
  const [sj_c, sj_ctx] = canvas(sj_size);
  const sj_rand = new Random(3);
  // a few leaves peeking out
  for (let sj_i = 0; sj_i < 18; sj_i++) {
    const [sj_x, sj_y] = lumpyPoint(sj_rand, sj_size / 2, sj_size / 2, sj_size * 0.4);
    sj_ctx.save();
    sj_ctx.translate(sj_x, sj_y);
    sj_ctx.rotate(sj_rand.range(0, Math.PI * 2));
    sj_ctx.fillStyle = sj_rand.pick(['#6f8f3e', '#86a24a']);
    sj_ctx.beginPath();
    sj_ctx.ellipse(0, 0, 9, 3.5, 0, 0, Math.PI * 2);
    sj_ctx.fill();
    sj_ctx.restore();
  }
  for (let sj_i = 0; sj_i < 150; sj_i++) {
    const [sj_x, sj_y] = lumpyPoint(sj_rand, sj_size / 2, sj_size / 2, sj_size * 0.44);
    const sj_r = sj_rand.range(6, 11);
    const sj_base = sj_rand.pick(sj_palette);
    sj_ctx.save();
    sj_ctx.translate(sj_x, sj_y);
    sj_ctx.rotate(sj_rand.range(0, Math.PI * 2));
    sj_ctx.fillStyle = sj_base;
    for (let sj_p = 0; sj_p < 5; sj_p++) {
      sj_ctx.rotate((Math.PI * 2) / 5);
      sj_ctx.beginPath();
      sj_ctx.ellipse(0, -sj_r * 0.55, sj_r * 0.42, sj_r * 0.58, 0, 0, Math.PI * 2);
      sj_ctx.fill();
    }
    // subtle shading towards the centre
    const sj_g = sj_ctx.createRadialGradient(0, 0, 0, 0, 0, sj_r);
    sj_g.addColorStop(0, 'rgba(190, 60, 100, 0.55)');
    sj_g.addColorStop(0.35, 'rgba(190, 60, 100, 0.12)');
    sj_g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    sj_ctx.fillStyle = sj_g;
    sj_ctx.beginPath();
    sj_ctx.arc(0, 0, sj_r, 0, Math.PI * 2);
    sj_ctx.fill();
    sj_ctx.fillStyle = '#f7d56a';
    sj_ctx.beginPath();
    sj_ctx.arc(0, 0, sj_r * 0.14, 0, Math.PI * 2);
    sj_ctx.fill();
    sj_ctx.restore();
  }
  return toTexture(sj_c);
}

export function createLeafTexture(
  sj_palette = ['#5f8a34', '#6f9a3c', '#7fa845', '#4f7a2c', '#8db552'],
) {
  const sj_size = 256;
  const [sj_c, sj_ctx] = canvas(sj_size);
  const sj_rand = new Random(5);
  for (let sj_i = 0; sj_i < 170; sj_i++) {
    const [sj_x, sj_y] = lumpyPoint(sj_rand, sj_size / 2, sj_size / 2, sj_size * 0.45);
    const sj_len = sj_rand.range(10, 17);
    sj_ctx.save();
    sj_ctx.translate(sj_x, sj_y);
    sj_ctx.rotate(sj_rand.range(0, Math.PI * 2));
    sj_ctx.fillStyle = sj_rand.pick(sj_palette);
    sj_ctx.beginPath();
    sj_ctx.moveTo(-sj_len, 0);
    sj_ctx.quadraticCurveTo(0, -sj_len * 0.45, sj_len, 0);
    sj_ctx.quadraticCurveTo(0, sj_len * 0.45, -sj_len, 0);
    sj_ctx.fill();
    sj_ctx.strokeStyle = 'rgba(30, 50, 10, 0.25)';
    sj_ctx.lineWidth = 1;
    sj_ctx.beginPath();
    sj_ctx.moveTo(-sj_len * 0.8, 0);
    sj_ctx.lineTo(sj_len * 0.8, 0);
    sj_ctx.stroke();
    sj_ctx.restore();
  }
  return toTexture(sj_c);
}

export function createPineTexture(sj_palette = ['#2f5433', '#3b6440', '#46704a', '#27472c']) {
  const sj_size = 256;
  const [sj_c, sj_ctx] = canvas(sj_size);
  const sj_rand = new Random(9);
  sj_ctx.lineCap = 'round';
  for (let sj_cluster = 0; sj_cluster < 55; sj_cluster++) {
    const [sj_cx, sj_cy] = lumpyPoint(sj_rand, sj_size / 2, sj_size / 2, sj_size * 0.42);
    const sj_n = sj_rand.int(10, 18);
    sj_ctx.strokeStyle = sj_rand.pick(sj_palette);
    sj_ctx.lineWidth = sj_rand.range(1.6, 2.6);
    for (let sj_i = 0; sj_i < sj_n; sj_i++) {
      const sj_a = sj_rand.range(0, Math.PI * 2);
      const sj_l = sj_rand.range(10, 20);
      sj_ctx.beginPath();
      sj_ctx.moveTo(sj_cx, sj_cy);
      sj_ctx.lineTo(sj_cx + Math.cos(sj_a) * sj_l, sj_cy + Math.sin(sj_a) * sj_l * 0.7);
      sj_ctx.stroke();
    }
  }
  return toTexture(sj_c);
}

/**
 * A ribbon of hanging willow: a few slender strands side by side, each a thin stem
 * hung with narrow leaves that point down and outwards, fresh yellow-green.
 */
export function createWillowTexture() {
  const [sj_c, sj_ctx] = canvas(128, 512);
  const sj_rand = new Random(12);
  const sj_greens = ['#a8c65c', '#94b84d', '#b9d46e', '#86a842', '#9fbf55', '#c4db7c'];
  const sj_strands = 7;
  for (let sj_strand = 0; sj_strand < sj_strands; sj_strand++) {
    const sj_x0 = 10 + sj_strand * 18 + sj_rand.range(-3, 3);
    const sj_bend = sj_rand.range(-7, 7);
    const sj_end = sj_rand.range(380, 506);
    const sj_stemX = (sj_y: number) => sj_x0 + sj_bend * Math.sin((sj_y / sj_end) * Math.PI * 0.8);
    sj_ctx.strokeStyle = 'rgba(96, 110, 46, 0.85)';
    sj_ctx.lineWidth = 1.4;
    sj_ctx.beginPath();
    sj_ctx.moveTo(sj_stemX(0), 0);
    for (let sj_y = 8; sj_y <= sj_end; sj_y += 8) sj_ctx.lineTo(sj_stemX(sj_y), sj_y);
    sj_ctx.stroke();
    let sj_side = sj_rand.chance(0.5) ? 1 : -1;
    for (let sj_y = 2; sj_y < sj_end - 4; sj_y += sj_rand.range(4.5, 7.5)) {
      sj_side = -sj_side;
      const sj_size = 1 - (sj_y / sj_end) * 0.3;
      sj_ctx.save();
      sj_ctx.translate(sj_stemX(sj_y), sj_y);
      sj_ctx.rotate(sj_side * sj_rand.range(0.35, 0.7));
      sj_ctx.fillStyle = sj_greens[sj_rand.int(0, sj_greens.length - 1)]!;
      sj_ctx.beginPath();
      // a narrow, pointed leaf hanging from the stem
      const sj_L = 22 * sj_size;
      const sj_W = 4.2 * sj_size;
      sj_ctx.moveTo(0, 0);
      sj_ctx.quadraticCurveTo(sj_side * sj_W * 1.6, sj_L * 0.45, sj_side * sj_W * 0.4, sj_L);
      sj_ctx.quadraticCurveTo(-sj_side * sj_W * 0.4, sj_L * 0.5, 0, 0);
      sj_ctx.fill();
      sj_ctx.restore();
    }
  }
  return toTexture(sj_c);
}

/**
 * A hanging spray of bamboo leaves: thin twigs fan out from the top centre (where the card
 * hangs from its branch), each carrying slender, pointed leaves that droop outwards. Leaves
 * shade from a darker base to a lighter tip; a few turn their paler undersides.
 */
export function createBambooLeafTexture() {
  const sj_size = 256;
  const [sj_c, sj_ctx] = canvas(sj_size);
  const sj_rand = new Random(21);
  const sj_greens: [string, string][] = [
    ['#5d8a33', '#86b04a'],
    ['#6a9a3a', '#98c056'],
    ['#557f2f', '#7fa845'],
    ['#71a13f', '#a4c862'],
    ['#4f772b', '#789f40'],
  ];
  const sj_under: [string, string] = ['#8aa86c', '#b8cf94'];

  const sj_leaf = (sj_x: number, sj_y: number, sj_angle: number, sj_len: number, sj_w: number) => {
    const [sj_base, sj_tip] = sj_rand.chance(0.18) ? sj_under : sj_rand.pick(sj_greens);
    const sj_bend = sj_rand.spread(sj_len * 0.12);
    sj_ctx.save();
    sj_ctx.translate(sj_x, sj_y);
    sj_ctx.rotate(sj_angle);
    const sj_g = sj_ctx.createLinearGradient(0, 0, 0, sj_len);
    sj_g.addColorStop(0, sj_base);
    sj_g.addColorStop(1, sj_tip);
    sj_ctx.fillStyle = sj_g;
    sj_ctx.beginPath();
    sj_ctx.moveTo(0, 0);
    sj_ctx.bezierCurveTo(sj_w * 0.95, sj_len * 0.14, sj_w * 0.75, sj_len * 0.62, sj_bend, sj_len);
    sj_ctx.bezierCurveTo(-sj_w * 0.55, sj_len * 0.62, -sj_w * 0.95, sj_len * 0.14, 0, 0);
    sj_ctx.fill();
    // midrib
    sj_ctx.strokeStyle = 'rgba(235, 245, 200, 0.35)';
    sj_ctx.lineWidth = 0.9;
    sj_ctx.beginPath();
    sj_ctx.moveTo(0, 2);
    sj_ctx.quadraticCurveTo(sj_bend * 0.3, sj_len * 0.5, sj_bend * 0.9, sj_len * 0.92);
    sj_ctx.stroke();
    sj_ctx.restore();
  };

  const sj_twigs = sj_rand.int(4, 5);
  for (let sj_t = 0; sj_t < sj_twigs; sj_t++) {
    // fan the twigs across the card, hanging from the top centre
    const sj_spread = (sj_t / (sj_twigs - 1)) * 2 - 1;
    const sj_x0 = sj_size / 2 + sj_rand.spread(10);
    const sj_y0 = sj_rand.range(4, 14);
    const sj_x1 = sj_size / 2 + sj_spread * sj_rand.range(60, 85);
    const sj_y1 = sj_rand.range(70, 120);
    const sj_cx = (sj_x0 + sj_x1) / 2 + sj_spread * 12;
    const sj_cy = sj_y0 + sj_rand.range(5, 25);
    sj_ctx.strokeStyle = '#6b7a38';
    sj_ctx.lineWidth = 1.6;
    sj_ctx.beginPath();
    sj_ctx.moveTo(sj_x0, sj_y0);
    sj_ctx.quadraticCurveTo(sj_cx, sj_cy, sj_x1, sj_y1);
    sj_ctx.stroke();
    const sj_leaves = sj_rand.int(4, 6);
    for (let sj_l = 0; sj_l < sj_leaves; sj_l++) {
      const sj_f = 0.3 + (0.7 * sj_l) / (sj_leaves - 1);
      // point on the twig (quadratic Bezier)
      const sj_u = 1 - sj_f;
      const sj_px = sj_u * sj_u * sj_x0 + 2 * sj_u * sj_f * sj_cx + sj_f * sj_f * sj_x1;
      const sj_py = sj_u * sj_u * sj_y0 + 2 * sj_u * sj_f * sj_cy + sj_f * sj_f * sj_y1;
      const sj_side = sj_l % 2 ? 1 : -1;
      // droop: mostly downwards, splayed to alternate sides, more outward on outer twigs
      const sj_angle = -sj_spread * 0.45 + sj_side * sj_rand.range(0.25, 0.7);
      sj_leaf(
        sj_px,
        sj_py,
        sj_angle,
        sj_rand.range(62, 100) * (1 - 0.15 * sj_f),
        sj_rand.range(7, 10.5),
      );
    }
  }
  return toTexture(sj_c);
}
