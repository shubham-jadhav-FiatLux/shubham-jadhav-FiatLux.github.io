import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { Random } from '../../utils/random';

/**
 * Procedural canopy textures painted with Canvas 2D. Each is a round-ish "clump" of
 * blossoms, leaves or needles with transparent surroundings, used on alpha-tested cards.
 */

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Random point inside a lumpy disc (so the clump silhouette is irregular). */
function lumpyPoint(rand: Random, cx: number, cy: number, radius: number): [number, number] {
  for (;;) {
    const x = rand.range(-1, 1);
    const y = rand.range(-1, 1);
    const a = Math.atan2(y, x);
    const lump = 0.78 + 0.22 * Math.sin(a * 5 + 1.3) * Math.cos(a * 3 - 0.4);
    if (x * x + y * y < lump * lump) return [cx + x * radius, cy + y * radius];
  }
}

export function createBlossomTexture(
  palette = ['#fbd3e0', '#f6b3c9', '#f29ab7', '#fde9ef', '#ee8fae'],
) {
  const size = 256;
  const [c, ctx] = canvas(size);
  const rand = new Random(3);
  // a few leaves peeking out
  for (let i = 0; i < 18; i++) {
    const [x, y] = lumpyPoint(rand, size / 2, size / 2, size * 0.4);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand.range(0, Math.PI * 2));
    ctx.fillStyle = rand.pick(['#6f8f3e', '#86a24a']);
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  for (let i = 0; i < 150; i++) {
    const [x, y] = lumpyPoint(rand, size / 2, size / 2, size * 0.44);
    const r = rand.range(6, 11);
    const base = rand.pick(palette);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand.range(0, Math.PI * 2));
    ctx.fillStyle = base;
    for (let p = 0; p < 5; p++) {
      ctx.rotate((Math.PI * 2) / 5);
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.55, r * 0.42, r * 0.58, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // subtle shading towards the centre
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, 'rgba(190, 60, 100, 0.55)');
    g.addColorStop(0.35, 'rgba(190, 60, 100, 0.12)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f7d56a';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  return toTexture(c);
}

export function createLeafTexture(
  palette = ['#5f8a34', '#6f9a3c', '#7fa845', '#4f7a2c', '#8db552'],
) {
  const size = 256;
  const [c, ctx] = canvas(size);
  const rand = new Random(5);
  for (let i = 0; i < 170; i++) {
    const [x, y] = lumpyPoint(rand, size / 2, size / 2, size * 0.45);
    const len = rand.range(10, 17);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand.range(0, Math.PI * 2));
    ctx.fillStyle = rand.pick(palette);
    ctx.beginPath();
    ctx.moveTo(-len, 0);
    ctx.quadraticCurveTo(0, -len * 0.45, len, 0);
    ctx.quadraticCurveTo(0, len * 0.45, -len, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30, 50, 10, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-len * 0.8, 0);
    ctx.lineTo(len * 0.8, 0);
    ctx.stroke();
    ctx.restore();
  }
  return toTexture(c);
}

export function createPineTexture(palette = ['#2f5433', '#3b6440', '#46704a', '#27472c']) {
  const size = 256;
  const [c, ctx] = canvas(size);
  const rand = new Random(9);
  ctx.lineCap = 'round';
  for (let cluster = 0; cluster < 55; cluster++) {
    const [cx, cy] = lumpyPoint(rand, size / 2, size / 2, size * 0.42);
    const n = rand.int(10, 18);
    ctx.strokeStyle = rand.pick(palette);
    ctx.lineWidth = rand.range(1.6, 2.6);
    for (let i = 0; i < n; i++) {
      const a = rand.range(0, Math.PI * 2);
      const l = rand.range(10, 20);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l * 0.7);
      ctx.stroke();
    }
  }
  return toTexture(c);
}

/** Tall strip of hanging willow leaves. */
export function createWillowTexture() {
  const [c, ctx] = canvas(64, 256);
  const rand = new Random(12);
  for (let strand = 0; strand < 3; strand++) {
    const x0 = 12 + strand * 20 + rand.range(-3, 3);
    ctx.strokeStyle = 'rgba(90, 110, 40, 0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.quadraticCurveTo(x0 + rand.range(-4, 4), 128, x0 + rand.range(-3, 3), 250);
    ctx.stroke();
    const end = rand.range(170, 250);
    for (let y = 4; y < end; y += rand.range(5, 9)) {
      const x = x0 + Math.sin(y * 0.02 + strand) * 2;
      const side = rand.chance(0.5) ? 1 : -1;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(side * rand.range(0.25, 0.6));
      ctx.fillStyle = rand.pick(['#a3c25a', '#8fb04b', '#b6cf6c', '#7c9d40']);
      ctx.beginPath();
      ctx.ellipse(side * 4, 4, 2.3, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  return toTexture(c);
}

/**
 * A hanging spray of bamboo leaves: thin twigs fan out from the top centre (where the card
 * hangs from its branch), each carrying slender, pointed leaves that droop outwards. Leaves
 * shade from a darker base to a lighter tip; a few turn their paler undersides.
 */
export function createBambooLeafTexture() {
  const size = 256;
  const [c, ctx] = canvas(size);
  const rand = new Random(21);
  const greens: [string, string][] = [
    ['#5d8a33', '#86b04a'],
    ['#6a9a3a', '#98c056'],
    ['#557f2f', '#7fa845'],
    ['#71a13f', '#a4c862'],
    ['#4f772b', '#789f40'],
  ];
  const under: [string, string] = ['#8aa86c', '#b8cf94'];

  const leaf = (x: number, y: number, angle: number, len: number, w: number) => {
    const [base, tip] = rand.chance(0.18) ? under : rand.pick(greens);
    const bend = rand.spread(len * 0.12);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, base);
    g.addColorStop(1, tip);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(w * 0.95, len * 0.14, w * 0.75, len * 0.62, bend, len);
    ctx.bezierCurveTo(-w * 0.55, len * 0.62, -w * 0.95, len * 0.14, 0, 0);
    ctx.fill();
    // midrib
    ctx.strokeStyle = 'rgba(235, 245, 200, 0.35)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.quadraticCurveTo(bend * 0.3, len * 0.5, bend * 0.9, len * 0.92);
    ctx.stroke();
    ctx.restore();
  };

  const twigs = rand.int(4, 5);
  for (let t = 0; t < twigs; t++) {
    // fan the twigs across the card, hanging from the top centre
    const spread = (t / (twigs - 1)) * 2 - 1;
    const x0 = size / 2 + rand.spread(10);
    const y0 = rand.range(4, 14);
    const x1 = size / 2 + spread * rand.range(60, 85);
    const y1 = rand.range(70, 120);
    const cx = (x0 + x1) / 2 + spread * 12;
    const cy = y0 + rand.range(5, 25);
    ctx.strokeStyle = '#6b7a38';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cx, cy, x1, y1);
    ctx.stroke();
    const leaves = rand.int(4, 6);
    for (let l = 0; l < leaves; l++) {
      const f = 0.3 + (0.7 * l) / (leaves - 1);
      // point on the twig (quadratic Bezier)
      const u = 1 - f;
      const px = u * u * x0 + 2 * u * f * cx + f * f * x1;
      const py = u * u * y0 + 2 * u * f * cy + f * f * y1;
      const side = l % 2 ? 1 : -1;
      // droop: mostly downwards, splayed to alternate sides, more outward on outer twigs
      const angle = -spread * 0.45 + side * rand.range(0.25, 0.7);
      leaf(px, py, angle, rand.range(62, 100) * (1 - 0.15 * f), rand.range(7, 10.5));
    }
  }
  return toTexture(c);
}
