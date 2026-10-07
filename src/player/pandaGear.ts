import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  FrontSide,
  Matrix4,
  MeshPhysicalMaterial,
  Quaternion,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  type ColorRepresentation,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The panda's gear, in detail: a silk scarf wound round the neck with gold-embroidered
 * hems and a knot, its tails ending in fringes; and the bamboo scroll case slung across
 * its back on a leather strap, with nodes, cord bindings, brass caps, a scroll tied with
 * red cord peeking out and a tassel.
 */

const SILK = '#c8352a';
const SILK_DARK = '#7c1d16';
const GOLD = '#e2b956';
const GOLD_DARK = '#9c7428';

/* ---------------------------------------------------------------- Textures */

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d')! };
}

function texture(c: HTMLCanvasElement, repeat = false): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = RepeatWrapping;
  return t;
}

/** A small embroidered flower: four petals round a centre. */
function flower(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = GOLD;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.ellipse(
      x + Math.cos(a) * r * 0.55,
      y + Math.sin(a) * r * 0.55,
      r * 0.5,
      r * 0.32,
      a,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.fillStyle = SILK_DARK;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

/** Silk weave: fine lighter threads over the base colour. */
function weave(ctx: CanvasRenderingContext2D, w: number, h: number, horizontal: boolean) {
  ctx.fillStyle = 'rgba(255, 214, 196, 0.07)';
  if (horizontal) for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  else for (let x = 0; x < w; x += 3) ctx.fillRect(x, 0, 1, h);
}

/**
 * The band wound round the neck. u runs along the band (tiling), v across it: 0 and 1 on
 * the inside against the neck, 0.25 the lower hem, 0.5 the outer face, 0.75 the upper hem.
 */
function bandTexture(): CanvasTexture {
  const W = 512;
  const H = 128;
  const { c, ctx } = canvas(W, H);
  const y = (v: number) => (1 - v) * H;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, SILK_DARK);
  g.addColorStop(0.25, '#a72a20');
  g.addColorStop(0.5, '#d23d2e');
  g.addColorStop(0.75, '#a72a20');
  g.addColorStop(1, SILK_DARK);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  weave(ctx, W, H, true);
  // gold-embroidered hems, each with a dark stitch line
  for (const v of [0.3, 0.7]) {
    ctx.fillStyle = GOLD;
    ctx.fillRect(0, y(v) - 4, W, 8);
    ctx.fillStyle = GOLD_DARK;
    ctx.fillRect(0, y(v) - 1, W, 1.5);
  }
  // a row of little flowers on the outer face, with diamonds between
  for (let i = 0; i < 4; i++) {
    const x = (i + 0.5) * (W / 4);
    flower(ctx, x, y(0.5), 9);
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    const dx = x + W / 8;
    ctx.moveTo(dx, y(0.5) - 5);
    ctx.lineTo(dx + 4, y(0.5));
    ctx.lineTo(dx, y(0.5) + 5);
    ctx.lineTo(dx - 4, y(0.5));
    ctx.fill();
  }
  return texture(c, true);
}

/**
 * The tails. u runs across a tail, v along it from the knot (0) to the end (1): gold hems
 * down both edges, a flower near the end, a gold band and then a fringe of threads (cut out
 * with an alpha test).
 */
function tailTexture(): CanvasTexture {
  const W = 128;
  const H = 512;
  const { c, ctx } = canvas(W, H);
  const y = (v: number) => (1 - v) * H;
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#9c261d');
  g.addColorStop(0.5, '#cf3b2d');
  g.addColorStop(1, '#9c261d');
  ctx.fillStyle = g;
  ctx.fillRect(0, y(0.9), W, H);
  weave(ctx, W, H, false);
  ctx.fillStyle = GOLD;
  ctx.fillRect(W * 0.07, y(0.88), W * 0.07, H * 0.88);
  ctx.fillRect(W * 0.86, y(0.88), W * 0.07, H * 0.88);
  // the end: a flower, then a gold band
  flower(ctx, W / 2, y(0.78), 22);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, y(0.9), W, H * 0.025);
  ctx.fillStyle = GOLD_DARK;
  ctx.fillRect(0, y(0.9) + H * 0.025, W, 2);
  // the fringe: threads of uneven length, gaps transparent
  for (let x = 2; x < W; x += 6) {
    const len = H * (0.075 + Math.sin(x * 1.7) * 0.012 + Math.sin(x * 0.37) * 0.01);
    ctx.fillStyle = x % 12 === 2 ? '#b8302a' : GOLD;
    ctx.fillRect(x, y(0.9) - len, 3.5, len);
  }
  return texture(c);
}

/** Silk: a sheen that catches the light at grazing angles. */
export function createSilkMaterial(
  map: CanvasTexture,
  options: { alphaTest?: number; doubleSided?: boolean } = {},
): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    map,
    roughness: 0.55,
    metalness: 0,
    sheen: 0.9,
    sheenRoughness: 0.4,
    sheenColor: new Color('#ffc2a8'),
    alphaTest: options.alphaTest ?? 0,
    side: options.doubleSided ? DoubleSide : FrontSide,
  });
}

let tailMap: CanvasTexture | null = null;

/** Material for the simulated tails: silk with gold hems and fringed ends. */
export function createTailMaterial(): MeshPhysicalMaterial {
  tailMap ??= tailTexture();
  return createSilkMaterial(tailMap, { alphaTest: 0.5, doubleSided: true });
}

/* ---------------------------------------------------------------- Scarf */

/** Sets every uv of `g` to one spot of the texture (a plain patch of silk). */
function flatUv(g: BufferGeometry, u: number, v: number): BufferGeometry {
  const n = g.attributes.position!.count;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  return g;
}

/**
 * The scarf wound round the neck (a soft band that bunches into folds, lower at the
 * front) and its knot, in panda body space. `knot` is where the tails hang from.
 */
export function createScarfGeometry(knot: Vector3): BufferGeometry {
  const around = 96;
  const across = 14;
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let i = 0; i <= around; i++) {
    const u = i / around;
    const th = u * Math.PI * 2;
    // the cloth bunches as it wraps: a few big folds and many small pleats
    const fold = Math.sin(th * 4 + 1.3) * 0.6 + Math.sin(th * 11) * 0.4;
    const radius = 0.392 + 0.012 * fold;
    const cy = 0.825 - 0.036 * Math.cos(th);
    const half = 0.074 + 0.009 * Math.sin(th * 3 + 0.4);
    const thick = 0.04 + 0.01 * fold;
    for (let j = 0; j <= across; j++) {
      const v = j / across;
      // start on the inside, so the texture seam is hidden against the neck
      const ph = Math.PI + v * Math.PI * 2;
      // a collar: the upper edge tucks in against the neck, the lower edge rests on the
      // shoulders
      const r = radius + Math.cos(ph) * thick - Math.sin(ph) * half * 0.6;
      positions.push(Math.sin(th) * r, cy + Math.sin(ph) * half, Math.cos(th) * r * 0.9);
      uvs.push(u * 6, v);
    }
  }
  const index: number[] = [];
  const row = across + 1;
  for (let i = 0; i < around; i++) {
    for (let j = 0; j < across; j++) {
      const a = i * row + j;
      const b = a + row;
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const band = new BufferGeometry();
  band.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  band.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  band.setIndex(index);
  band.computeVertexNormals();

  // The knot: a firm centre and two loops, tied off on one side of the chest.
  const parts: BufferGeometry[] = [band];
  const centre = new SphereGeometry(0.052, 14, 10).scale(1, 0.85, 0.72);
  parts.push(flatUv(centre.translate(knot.x, knot.y + 0.03, knot.z - 0.005), 0.02, 0.5));
  for (const side of [-1, 1]) {
    const loop = new TorusGeometry(0.042, 0.018, 8, 16);
    loop.scale(1, 0.75, 0.6);
    loop.rotateZ(side * 0.5);
    loop.rotateY(0.2);
    loop.translate(knot.x + side * 0.055, knot.y + 0.035, knot.z - 0.015);
    parts.push(flatUv(loop, 0.04, 0.5));
  }
  const merged = mergeGeometries(
    parts.map((p) => (p.index ? p.toNonIndexed() : p)),
    false,
  )!;
  merged.computeVertexNormals();
  return merged;
}

let bandMap: CanvasTexture | null = null;

export function createScarfMaterial(): MeshPhysicalMaterial {
  bandMap ??= bandTexture();
  return createSilkMaterial(bandMap);
}

/* ---------------------------------------------------------------- Scroll case */

interface Part {
  geo: BufferGeometry;
  color: ColorRepresentation;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

function colored(parts: Part[], m: Matrix4): BufferGeometry {
  const geos = parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    g.deleteAttribute('uv');
    const c = new Color(p.color);
    const n = g.attributes.position!.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new BufferAttribute(col, 3));
    const local = new Matrix4().compose(
      new Vector3(...(p.position ?? [0, 0, 0])),
      new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), p.rotation?.[0] ?? 0),
      new Vector3(1, 1, 1),
    );
    g.applyMatrix4(local).applyMatrix4(m);
    return g;
  });
  return mergeGeometries(geos, false)!;
}

const flat: [number, number, number] = [Math.PI / 2, 0, 0];

/**
 * The bamboo scroll case (along its own y axis, placed by `m`), the tassel hanging from
 * its foot, and the leather strap round the body with a brass buckle on the chest.
 */
export function createGearGeometry(m: Matrix4): BufferGeometry {
  const bamboo = ['#b7aa62', '#a99c55', '#b2a45d'];
  const node = '#7d7036';
  const cord = '#3a2416';
  const brass = '#c49a46';
  const brassDark = '#8a6528';
  const parts: Part[] = [];
  // three lengths of bamboo between two nodes
  bamboo.forEach((color, i) =>
    parts.push({
      geo: new CylinderGeometry(0.074, 0.074, 0.22, 18),
      color,
      position: [0, -0.21 + i * 0.21, 0],
    }),
  );
  for (const y of [-0.105, 0.105]) {
    parts.push({
      geo: new TorusGeometry(0.0752, 0.0085, 6, 28),
      color: node,
      position: [0, y, 0],
      rotation: flat,
    });
  }
  // cord bindings where the strap holds the case
  for (const y of [-0.235, 0.235]) {
    for (const dy of [-0.016, 0, 0.016]) {
      parts.push({
        geo: new TorusGeometry(0.078, 0.0068, 5, 28),
        color: cord,
        position: [0, y + dy, 0],
        rotation: flat,
      });
    }
  }
  // brass caps: a closed foot with a knob, an open collar at the top
  parts.push({
    geo: new CylinderGeometry(0.083, 0.08, 0.05, 20),
    color: brass,
    position: [0, -0.345, 0],
  });
  parts.push({
    geo: new TorusGeometry(0.082, 0.0075, 6, 28),
    color: brassDark,
    position: [0, -0.318, 0],
    rotation: flat,
  });
  parts.push({ geo: new SphereGeometry(0.024, 12, 8), color: brass, position: [0, -0.374, 0] });
  parts.push({
    geo: new CylinderGeometry(0.082, 0.082, 0.036, 20, 1, true),
    color: brass,
    position: [0, 0.336, 0],
  });
  parts.push({
    geo: new TorusGeometry(0.082, 0.0075, 6, 28),
    color: brassDark,
    position: [0, 0.354, 0],
    rotation: flat,
  });
  // the scroll inside, its end tied with red cord
  parts.push({
    geo: new CylinderGeometry(0.056, 0.056, 0.13, 16),
    color: '#f3ead6',
    position: [0, 0.39, 0],
  });
  parts.push({
    geo: new CylinderGeometry(0.022, 0.022, 0.134, 10),
    color: '#c9b48a',
    position: [0, 0.392, 0],
  });
  parts.push({
    geo: new TorusGeometry(0.057, 0.0065, 5, 22),
    color: SILK,
    position: [0, 0.405, 0],
    rotation: flat,
  });
  const caseGeo = colored(parts, m);

  // A tassel hanging straight down from the foot of the case.
  const foot = new Vector3(0, -0.385, 0).applyMatrix4(m);
  const tassel = colored(
    [
      {
        geo: new CylinderGeometry(0.005, 0.005, 0.07, 6),
        color: SILK,
        position: [foot.x, foot.y - 0.035, foot.z],
      },
      {
        geo: new SphereGeometry(0.016, 10, 8),
        color: GOLD,
        position: [foot.x, foot.y - 0.075, foot.z],
      },
      {
        geo: new CylinderGeometry(0.009, 0.026, 0.09, 12),
        color: SILK,
        position: [foot.x, foot.y - 0.135, foot.z],
      },
    ],
    new Matrix4(),
  );

  return mergeGeometries([caseGeo, tassel, createStrap()], false)!;
}

/** A flat leather strap looped diagonally round the torso, with a brass buckle at the front. */
function createStrap(): BufferGeometry {
  // the loop lies in the strap's own xy plane, then tilts across the body (from one
  // shoulder to the other hip)
  const m = new Matrix4().compose(
    new Vector3(0, 0.7, 0),
    new Quaternion().setFromEuler(new Euler(Math.PI / 2, 0.72, 0)),
    new Vector3(1, 0.9, 1),
  );
  const n = 72;
  const radius = 0.43;
  const half = 0.032;
  const thick = 0.012;
  const positions: number[] = [];
  const colors: number[] = [];
  const leather = new Color('#5a3320');
  const edge = new Color('#3b2013');
  const centres: Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = new Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    const out = new Vector3(Math.cos(a), Math.sin(a), 0);
    centres.push(c.clone().applyMatrix4(m));
    // the corners of the cross-section: outer and inner face, either edge
    for (const [o, w] of [
      [1, 1],
      [1, -1],
      [-1, -1],
      [-1, 1],
    ] as const) {
      const p = c
        .clone()
        .addScaledVector(out, o * thick)
        .add(new Vector3(0, 0, w * half))
        .applyMatrix4(m);
      positions.push(p.x, p.y, p.z);
      const col = o > 0 ? leather : edge;
      colors.push(col.r, col.g, col.b);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 4;
    const b = ((i + 1) % n) * 4;
    for (let k = 0; k < 4; k++) {
      const k1 = (k + 1) % 4;
      index.push(a + k, b + k, a + k1, a + k1, b + k, b + k1);
    }
  }
  const band = new BufferGeometry();
  band.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  band.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  band.setIndex(index);
  band.computeVertexNormals();

  // the buckle where the strap crosses the front of the chest
  let front = 0;
  centres.forEach((c, i) => {
    if (c.z > centres[front]!.z) front = i;
  });
  const at = centres[front]!;
  const along = centres[(front + 1) % n]!.clone()
    .sub(centres[(front + n - 1) % n]!)
    .normalize();
  const outward = new Vector3(at.x, 0, at.z).normalize();
  const across = new Vector3().crossVectors(outward, along).normalize();
  const basis = new Matrix4().makeBasis(along, across, outward).setPosition(at);
  const plate = box(0.05, 0.085, 0.016, '#c9a24a').applyMatrix4(
    basis.clone().multiply(new Matrix4().makeTranslation(0, 0, 0.012)),
  );
  const slot = box(0.022, 0.05, 0.01, '#4a2a18').applyMatrix4(
    basis.clone().multiply(new Matrix4().makeTranslation(0, 0, 0.018)),
  );
  return mergeGeometries([band.toNonIndexed(), plate, slot], false)!;
}

function box(x: number, y: number, z: number, color: string): BufferGeometry {
  const g = new BoxGeometry(x, y, z).toNonIndexed();
  g.deleteAttribute('uv');
  const c = new Color(color);
  const n = g.attributes.position!.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
}
