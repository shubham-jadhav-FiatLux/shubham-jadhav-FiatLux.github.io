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

const sj_SILK = '#c8352a';
const sj_SILK_DARK = '#7c1d16';
const sj_GOLD = '#e2b956';
const sj_GOLD_DARK = '#9c7428';

/* ---------------------------------------------------------------- Textures */

function canvas(sj_w: number, sj_h: number) {
  const sj_c = document.createElement('canvas');
  sj_c.width = sj_w;
  sj_c.height = sj_h;
  return { c: sj_c, ctx: sj_c.getContext('2d')! };
}

function texture(sj_c: HTMLCanvasElement, sj_repeat = false): CanvasTexture {
  const sj_t = new CanvasTexture(sj_c);
  sj_t.colorSpace = SRGBColorSpace;
  sj_t.anisotropy = 4;
  if (sj_repeat) sj_t.wrapS = RepeatWrapping;
  return sj_t;
}

/** A small embroidered flower: four petals round a centre. */
function flower(sj_ctx: CanvasRenderingContext2D, sj_x: number, sj_y: number, sj_r: number) {
  sj_ctx.fillStyle = sj_GOLD;
  for (let sj_k = 0; sj_k < 4; sj_k++) {
    const sj_a = (sj_k / 4) * Math.PI * 2 + Math.PI / 4;
    sj_ctx.beginPath();
    sj_ctx.ellipse(
      sj_x + Math.cos(sj_a) * sj_r * 0.55,
      sj_y + Math.sin(sj_a) * sj_r * 0.55,
      sj_r * 0.5,
      sj_r * 0.32,
      sj_a,
      0,
      Math.PI * 2,
    );
    sj_ctx.fill();
  }
  sj_ctx.fillStyle = sj_SILK_DARK;
  sj_ctx.beginPath();
  sj_ctx.arc(sj_x, sj_y, sj_r * 0.22, 0, Math.PI * 2);
  sj_ctx.fill();
}

/** Silk weave: fine lighter threads over the base colour. */
function weave(
  sj_ctx: CanvasRenderingContext2D,
  sj_w: number,
  sj_h: number,
  sj_horizontal: boolean,
) {
  sj_ctx.fillStyle = 'rgba(255, 214, 196, 0.07)';
  if (sj_horizontal) for (let sj_y = 0; sj_y < sj_h; sj_y += 3) sj_ctx.fillRect(0, sj_y, sj_w, 1);
  else for (let sj_x = 0; sj_x < sj_w; sj_x += 3) sj_ctx.fillRect(sj_x, 0, 1, sj_h);
}

/**
 * The band wound round the neck. u runs along the band (tiling), v across it: 0 and 1 on
 * the inside against the neck, 0.25 the lower hem, 0.5 the outer face, 0.75 the upper hem.
 */
function bandTexture(): CanvasTexture {
  const sj_W = 512;
  const sj_H = 128;
  const { c: sj_c, ctx: sj_ctx } = canvas(sj_W, sj_H);
  const sj_y = (sj_v: number) => (1 - sj_v) * sj_H;
  const sj_g = sj_ctx.createLinearGradient(0, 0, 0, sj_H);
  sj_g.addColorStop(0, sj_SILK_DARK);
  sj_g.addColorStop(0.25, '#a72a20');
  sj_g.addColorStop(0.5, '#d23d2e');
  sj_g.addColorStop(0.75, '#a72a20');
  sj_g.addColorStop(1, sj_SILK_DARK);
  sj_ctx.fillStyle = sj_g;
  sj_ctx.fillRect(0, 0, sj_W, sj_H);
  weave(sj_ctx, sj_W, sj_H, true);
  // gold-embroidered hems, each with a dark stitch line
  for (const sj_v of [0.3, 0.7]) {
    sj_ctx.fillStyle = sj_GOLD;
    sj_ctx.fillRect(0, sj_y(sj_v) - 4, sj_W, 8);
    sj_ctx.fillStyle = sj_GOLD_DARK;
    sj_ctx.fillRect(0, sj_y(sj_v) - 1, sj_W, 1.5);
  }
  // a row of little flowers on the outer face, with diamonds between
  for (let sj_i = 0; sj_i < 4; sj_i++) {
    const sj_x = (sj_i + 0.5) * (sj_W / 4);
    flower(sj_ctx, sj_x, sj_y(0.5), 9);
    sj_ctx.fillStyle = sj_GOLD;
    sj_ctx.beginPath();
    const sj_dx = sj_x + sj_W / 8;
    sj_ctx.moveTo(sj_dx, sj_y(0.5) - 5);
    sj_ctx.lineTo(sj_dx + 4, sj_y(0.5));
    sj_ctx.lineTo(sj_dx, sj_y(0.5) + 5);
    sj_ctx.lineTo(sj_dx - 4, sj_y(0.5));
    sj_ctx.fill();
  }
  return texture(sj_c, true);
}

/**
 * The tails. u runs across a tail, v along it from the knot (0) to the end (1): gold hems
 * down both edges, a flower near the end, a gold band and then a fringe of threads (cut out
 * with an alpha test).
 */
function tailTexture(): CanvasTexture {
  const sj_W = 128;
  const sj_H = 512;
  const { c: sj_c, ctx: sj_ctx } = canvas(sj_W, sj_H);
  const sj_y = (sj_v: number) => (1 - sj_v) * sj_H;
  const sj_g = sj_ctx.createLinearGradient(0, 0, sj_W, 0);
  sj_g.addColorStop(0, '#9c261d');
  sj_g.addColorStop(0.5, '#cf3b2d');
  sj_g.addColorStop(1, '#9c261d');
  sj_ctx.fillStyle = sj_g;
  sj_ctx.fillRect(0, sj_y(0.9), sj_W, sj_H);
  weave(sj_ctx, sj_W, sj_H, false);
  sj_ctx.fillStyle = sj_GOLD;
  sj_ctx.fillRect(sj_W * 0.07, sj_y(0.88), sj_W * 0.07, sj_H * 0.88);
  sj_ctx.fillRect(sj_W * 0.86, sj_y(0.88), sj_W * 0.07, sj_H * 0.88);
  // the end: a flower, then a gold band
  flower(sj_ctx, sj_W / 2, sj_y(0.78), 22);
  sj_ctx.fillStyle = sj_GOLD;
  sj_ctx.fillRect(0, sj_y(0.9), sj_W, sj_H * 0.025);
  sj_ctx.fillStyle = sj_GOLD_DARK;
  sj_ctx.fillRect(0, sj_y(0.9) + sj_H * 0.025, sj_W, 2);
  // the fringe: threads of uneven length, gaps transparent
  for (let sj_x = 2; sj_x < sj_W; sj_x += 6) {
    const sj_len = sj_H * (0.075 + Math.sin(sj_x * 1.7) * 0.012 + Math.sin(sj_x * 0.37) * 0.01);
    sj_ctx.fillStyle = sj_x % 12 === 2 ? '#b8302a' : sj_GOLD;
    sj_ctx.fillRect(sj_x, sj_y(0.9) - sj_len, 3.5, sj_len);
  }
  return texture(sj_c);
}

/** Silk: a sheen that catches the light at grazing angles. */
export function createSilkMaterial(
  sj_map: CanvasTexture,
  sj_options: { alphaTest?: number; doubleSided?: boolean } = {},
): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    map: sj_map,
    roughness: 0.55,
    metalness: 0,
    sheen: 0.9,
    sheenRoughness: 0.4,
    sheenColor: new Color('#ffc2a8'),
    alphaTest: sj_options.alphaTest ?? 0,
    side: sj_options.doubleSided ? DoubleSide : FrontSide,
  });
}

let sj_tailMap: CanvasTexture | null = null;

/** Material for the simulated tails: silk with gold hems and fringed ends. */
export function createTailMaterial(): MeshPhysicalMaterial {
  sj_tailMap ??= tailTexture();
  return createSilkMaterial(sj_tailMap, { alphaTest: 0.5, doubleSided: true });
}

/* ---------------------------------------------------------------- Scarf */

/** Sets every uv of `sj_g` to one spot of the texture (a plain patch of silk). */
function flatUv(sj_g: BufferGeometry, sj_u: number, sj_v: number): BufferGeometry {
  const sj_n = sj_g.attributes.position!.count;
  const sj_uv = new Float32Array(sj_n * 2);
  for (let sj_i = 0; sj_i < sj_n; sj_i++) {
    sj_uv[sj_i * 2] = sj_u;
    sj_uv[sj_i * 2 + 1] = sj_v;
  }
  sj_g.setAttribute('uv', new BufferAttribute(sj_uv, 2));
  return sj_g;
}

/** The torso's profile round the neck as [height, radius] (as built in `Panda.ts`). */
const sj_NECK: readonly (readonly [number, number])[] = [
  [0.69, 0.418],
  [0.745, 0.398],
  [0.8, 0.37],
  [0.87, 0.33],
  [0.93, 0.28],
  [0.965, 0.24],
];

/** The torso's radius at height `sj_y` round the neck. */
function torsoRadius(sj_y: number): number {
  let [sj_y0, sj_r0] = sj_NECK[0]!;
  if (sj_y <= sj_y0) return sj_r0;
  for (const [sj_y1, sj_r1] of sj_NECK) {
    if (sj_y <= sj_y1) return sj_r0 + ((sj_r1 - sj_r0) * (sj_y - sj_y0)) / (sj_y1 - sj_y0);
    [sj_y0, sj_r0] = [sj_y1, sj_r1];
  }
  return sj_r0;
}

/**
 * The scarf wound round the neck (a soft band that bunches into folds, lower at the
 * front) and its knot, in panda body space. `sj_knot` is where the tails hang from.
 */
export function createScarfGeometry(sj_knot: Vector3): BufferGeometry {
  const sj_around = 96;
  const sj_across = 14;
  const sj_positions: number[] = [];
  const sj_uvs: number[] = [];
  for (let sj_i = 0; sj_i <= sj_around; sj_i++) {
    const sj_u = sj_i / sj_around;
    const sj_th = sj_u * Math.PI * 2;
    // the cloth bunches as it wraps: a few big folds and many small pleats
    const sj_fold = Math.sin(sj_th * 4 + 1.3) * 0.6 + Math.sin(sj_th * 11) * 0.4;
    // a little higher at the back; wound snugly, just proud of the fur all the way round
    const sj_cy = 0.825 - 0.036 * Math.cos(sj_th);
    const sj_radius = torsoRadius(sj_cy) + 0.014 + 0.01 * sj_fold;
    const sj_half = 0.074 + 0.009 * Math.sin(sj_th * 3 + 0.4);
    const sj_thick = 0.03 + 0.008 * sj_fold;
    for (let sj_j = 0; sj_j <= sj_across; sj_j++) {
      const sj_v = sj_j / sj_across;
      // start on the inside, so the texture seam is hidden against the neck
      const sj_ph = Math.PI + sj_v * Math.PI * 2;
      // a collar: the upper edge tucks in against the neck, the lower edge rests on the
      // shoulders
      const sj_r = sj_radius + Math.cos(sj_ph) * sj_thick - Math.sin(sj_ph) * sj_half * 0.35;
      sj_positions.push(
        Math.sin(sj_th) * sj_r,
        sj_cy + Math.sin(sj_ph) * sj_half,
        Math.cos(sj_th) * sj_r * 0.9,
      );
      sj_uvs.push(sj_u * 6, sj_v);
    }
  }
  const sj_index: number[] = [];
  const sj_row = sj_across + 1;
  for (let sj_i = 0; sj_i < sj_around; sj_i++) {
    for (let sj_j = 0; sj_j < sj_across; sj_j++) {
      const sj_a = sj_i * sj_row + sj_j;
      const sj_b = sj_a + sj_row;
      // wound so that the outer face is the front face
      sj_index.push(sj_a, sj_b, sj_a + 1, sj_a + 1, sj_b, sj_b + 1);
    }
  }
  const sj_band = new BufferGeometry();
  sj_band.setAttribute('position', new BufferAttribute(new Float32Array(sj_positions), 3));
  sj_band.setAttribute('uv', new BufferAttribute(new Float32Array(sj_uvs), 2));
  sj_band.setIndex(sj_index);
  sj_band.computeVertexNormals();
  // the first and last rings are the same place: share their normals so no crease shows
  const sj_normal = sj_band.attributes.normal as BufferAttribute;
  for (let sj_j = 0; sj_j <= sj_across; sj_j++) {
    const sj_first = sj_j;
    const sj_last = sj_around * sj_row + sj_j;
    const sj_nx = sj_normal.getX(sj_first) + sj_normal.getX(sj_last);
    const sj_ny = sj_normal.getY(sj_first) + sj_normal.getY(sj_last);
    const sj_nz = sj_normal.getZ(sj_first) + sj_normal.getZ(sj_last);
    const sj_len = Math.hypot(sj_nx, sj_ny, sj_nz) || 1;
    sj_normal.setXYZ(sj_first, sj_nx / sj_len, sj_ny / sj_len, sj_nz / sj_len);
    sj_normal.setXYZ(sj_last, sj_nx / sj_len, sj_ny / sj_len, sj_nz / sj_len);
  }

  // The knot: a firm centre and two loops, tied off on one side of the chest.
  const sj_parts: BufferGeometry[] = [sj_band];
  const sj_centre = new SphereGeometry(0.052, 14, 10).scale(1, 0.85, 0.72);
  sj_parts.push(
    flatUv(sj_centre.translate(sj_knot.x, sj_knot.y + 0.03, sj_knot.z - 0.005), 0.02, 0.5),
  );
  for (const sj_side of [-1, 1]) {
    const sj_loop = new TorusGeometry(0.042, 0.018, 8, 16);
    sj_loop.scale(1, 0.75, 0.6);
    sj_loop.rotateZ(sj_side * 0.5);
    sj_loop.rotateY(0.2);
    sj_loop.translate(sj_knot.x + sj_side * 0.055, sj_knot.y + 0.035, sj_knot.z - 0.015);
    sj_parts.push(flatUv(sj_loop, 0.04, 0.5));
  }
  // (every part keeps its own smooth normals)
  return mergeGeometries(
    sj_parts.map((sj_p) => (sj_p.index ? sj_p.toNonIndexed() : sj_p)),
    false,
  )!;
}

let sj_bandMap: CanvasTexture | null = null;

export function createScarfMaterial(): MeshPhysicalMaterial {
  sj_bandMap ??= bandTexture();
  return createSilkMaterial(sj_bandMap);
}

/* ---------------------------------------------------------------- Scroll case */

interface Part {
  geo: BufferGeometry;
  color: ColorRepresentation;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

function colored(sj_parts: Part[], sj_m: Matrix4): BufferGeometry {
  const sj_geos = sj_parts.map((sj_p) => {
    const sj_g = sj_p.geo.index ? sj_p.geo.toNonIndexed() : sj_p.geo;
    sj_g.deleteAttribute('uv');
    const sj_c = new Color(sj_p.color);
    const sj_n = sj_g.attributes.position!.count;
    const sj_col = new Float32Array(sj_n * 3);
    for (let sj_i = 0; sj_i < sj_n; sj_i++) sj_col.set([sj_c.r, sj_c.g, sj_c.b], sj_i * 3);
    sj_g.setAttribute('color', new BufferAttribute(sj_col, 3));
    const sj_local = new Matrix4().compose(
      new Vector3(...(sj_p.position ?? [0, 0, 0])),
      new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), sj_p.rotation?.[0] ?? 0),
      new Vector3(1, 1, 1),
    );
    sj_g.applyMatrix4(sj_local).applyMatrix4(sj_m);
    return sj_g;
  });
  return mergeGeometries(sj_geos, false)!;
}

const sj_flat: [number, number, number] = [Math.PI / 2, 0, 0];

/**
 * The bamboo scroll case (along its own y axis, placed by `sj_m`), the tassel hanging from
 * its foot, and the leather strap round the body with a brass buckle on the chest.
 */
export function createGearGeometry(sj_m: Matrix4): BufferGeometry {
  const sj_bamboo = ['#b7aa62', '#a99c55', '#b2a45d'];
  const sj_node = '#7d7036';
  const sj_cord = '#3a2416';
  const sj_brass = '#c49a46';
  const sj_brassDark = '#8a6528';
  const sj_parts: Part[] = [];
  // three lengths of bamboo between two nodes
  sj_bamboo.forEach((sj_color, sj_i) =>
    sj_parts.push({
      geo: new CylinderGeometry(0.074, 0.074, 0.22, 18),
      color: sj_color,
      position: [0, -0.21 + sj_i * 0.21, 0],
    }),
  );
  for (const sj_y of [-0.105, 0.105]) {
    sj_parts.push({
      geo: new TorusGeometry(0.0752, 0.0085, 6, 28),
      color: sj_node,
      position: [0, sj_y, 0],
      rotation: sj_flat,
    });
  }
  // cord bindings where the strap holds the case
  for (const sj_y of [-0.235, 0.235]) {
    for (const sj_dy of [-0.016, 0, 0.016]) {
      sj_parts.push({
        geo: new TorusGeometry(0.078, 0.0068, 5, 28),
        color: sj_cord,
        position: [0, sj_y + sj_dy, 0],
        rotation: sj_flat,
      });
    }
  }
  // brass caps: a closed foot with a knob, an open collar at the top
  sj_parts.push({
    geo: new CylinderGeometry(0.083, 0.08, 0.05, 20),
    color: sj_brass,
    position: [0, -0.345, 0],
  });
  sj_parts.push({
    geo: new TorusGeometry(0.082, 0.0075, 6, 28),
    color: sj_brassDark,
    position: [0, -0.318, 0],
    rotation: sj_flat,
  });
  sj_parts.push({
    geo: new SphereGeometry(0.024, 12, 8),
    color: sj_brass,
    position: [0, -0.374, 0],
  });
  sj_parts.push({
    geo: new CylinderGeometry(0.082, 0.082, 0.036, 20, 1, true),
    color: sj_brass,
    position: [0, 0.336, 0],
  });
  sj_parts.push({
    geo: new TorusGeometry(0.082, 0.0075, 6, 28),
    color: sj_brassDark,
    position: [0, 0.354, 0],
    rotation: sj_flat,
  });
  // the scroll inside, its end tied with red cord
  sj_parts.push({
    geo: new CylinderGeometry(0.056, 0.056, 0.13, 16),
    color: '#f3ead6',
    position: [0, 0.39, 0],
  });
  sj_parts.push({
    geo: new CylinderGeometry(0.022, 0.022, 0.134, 10),
    color: '#c9b48a',
    position: [0, 0.392, 0],
  });
  sj_parts.push({
    geo: new TorusGeometry(0.057, 0.0065, 5, 22),
    color: sj_SILK,
    position: [0, 0.405, 0],
    rotation: sj_flat,
  });
  const sj_caseGeo = colored(sj_parts, sj_m);

  // A tassel hanging straight down from the foot of the case.
  const sj_foot = new Vector3(0, -0.385, 0).applyMatrix4(sj_m);
  const sj_tassel = colored(
    [
      {
        geo: new CylinderGeometry(0.005, 0.005, 0.07, 6),
        color: sj_SILK,
        position: [sj_foot.x, sj_foot.y - 0.035, sj_foot.z],
      },
      {
        geo: new SphereGeometry(0.016, 10, 8),
        color: sj_GOLD,
        position: [sj_foot.x, sj_foot.y - 0.075, sj_foot.z],
      },
      {
        geo: new CylinderGeometry(0.009, 0.026, 0.09, 12),
        color: sj_SILK,
        position: [sj_foot.x, sj_foot.y - 0.135, sj_foot.z],
      },
    ],
    new Matrix4(),
  );

  return mergeGeometries([sj_caseGeo, sj_tassel, createStrap()], false)!;
}

/** A flat leather strap looped diagonally round the torso, with a brass buckle at the front. */
export function createStrap(): BufferGeometry {
  // the loop lies in the strap's own xy plane, then tilts across the body (from one
  // shoulder to the other hip)
  const sj_m = new Matrix4().compose(
    new Vector3(0, 0.7, 0),
    new Quaternion().setFromEuler(new Euler(Math.PI / 2, 0.72, 0)),
    new Vector3(1, 0.9, 1),
  );
  const sj_n = 72;
  const sj_radius = 0.43;
  const sj_half = 0.032;
  const sj_thick = 0.012;
  const sj_positions: number[] = [];
  const sj_colors: number[] = [];
  const sj_leather = new Color('#5a3320');
  const sj_edge = new Color('#3b2013');
  const sj_centres: Vector3[] = [];
  for (let sj_i = 0; sj_i < sj_n; sj_i++) {
    const sj_a = (sj_i / sj_n) * Math.PI * 2;
    const sj_c = new Vector3(Math.cos(sj_a) * sj_radius, Math.sin(sj_a) * sj_radius, 0);
    const sj_out = new Vector3(Math.cos(sj_a), Math.sin(sj_a), 0);
    sj_centres.push(sj_c.clone().applyMatrix4(sj_m));
    // the corners of the cross-section: outer and inner face, either edge
    for (const [sj_o, sj_w] of [
      [1, 1],
      [1, -1],
      [-1, -1],
      [-1, 1],
    ] as const) {
      const sj_p = sj_c
        .clone()
        .addScaledVector(sj_out, sj_o * sj_thick)
        .add(new Vector3(0, 0, sj_w * sj_half))
        .applyMatrix4(sj_m);
      sj_positions.push(sj_p.x, sj_p.y, sj_p.z);
      const sj_col = sj_o > 0 ? sj_leather : sj_edge;
      sj_colors.push(sj_col.r, sj_col.g, sj_col.b);
    }
  }
  const sj_index: number[] = [];
  for (let sj_i = 0; sj_i < sj_n; sj_i++) {
    const sj_a = sj_i * 4;
    const sj_b = ((sj_i + 1) % sj_n) * 4;
    for (let sj_k = 0; sj_k < 4; sj_k++) {
      const sj_k1 = (sj_k + 1) % 4;
      // wound so that the faces look outwards
      sj_index.push(
        sj_a + sj_k,
        sj_a + sj_k1,
        sj_b + sj_k,
        sj_a + sj_k1,
        sj_b + sj_k1,
        sj_b + sj_k,
      );
    }
  }
  const sj_band = new BufferGeometry();
  sj_band.setAttribute('position', new BufferAttribute(new Float32Array(sj_positions), 3));
  sj_band.setAttribute('color', new BufferAttribute(new Float32Array(sj_colors), 3));
  sj_band.setIndex(sj_index);
  sj_band.computeVertexNormals();

  // the buckle where the strap crosses the front of the chest
  let sj_front = 0;
  sj_centres.forEach((sj_c, sj_i) => {
    if (sj_c.z > sj_centres[sj_front]!.z) sj_front = sj_i;
  });
  const sj_at = sj_centres[sj_front]!;
  const sj_along = sj_centres[(sj_front + 1) % sj_n]!.clone()
    .sub(sj_centres[(sj_front + sj_n - 1) % sj_n]!)
    .normalize();
  const sj_outward = new Vector3(sj_at.x, 0, sj_at.z).normalize();
  const sj_across = new Vector3().crossVectors(sj_outward, sj_along).normalize();
  const sj_basis = new Matrix4().makeBasis(sj_along, sj_across, sj_outward).setPosition(sj_at);
  const sj_plate = box(0.05, 0.085, 0.016, '#c9a24a').applyMatrix4(
    sj_basis.clone().multiply(new Matrix4().makeTranslation(0, 0, 0.012)),
  );
  const sj_slot = box(0.022, 0.05, 0.01, '#4a2a18').applyMatrix4(
    sj_basis.clone().multiply(new Matrix4().makeTranslation(0, 0, 0.018)),
  );
  return mergeGeometries([sj_band.toNonIndexed(), sj_plate, sj_slot], false)!;
}

function box(sj_x: number, sj_y: number, sj_z: number, sj_color: string): BufferGeometry {
  const sj_g = new BoxGeometry(sj_x, sj_y, sj_z).toNonIndexed();
  sj_g.deleteAttribute('uv');
  const sj_c = new Color(sj_color);
  const sj_n = sj_g.attributes.position!.count;
  const sj_col = new Float32Array(sj_n * 3);
  for (let sj_i = 0; sj_i < sj_n; sj_i++) sj_col.set([sj_c.r, sj_c.g, sj_c.b], sj_i * 3);
  sj_g.setAttribute('color', new BufferAttribute(sj_col, 3));
  return sj_g;
}
