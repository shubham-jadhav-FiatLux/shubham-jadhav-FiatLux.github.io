import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Matrix4,
  Quaternion,
  Vector3,
  type Scene,
} from 'three';
import { Random } from '../../utils/random';
import { createVegetationMaterial } from './vegetationMaterial';
import { createBambooLeafTexture } from './textures';
import { chunkedInstances } from './instancing';

export type BambooSpecies = 'green' | 'golden' | 'black';

export interface BambooStalk {
  x: number;
  y: number;
  z: number;
  /** height multiplier */
  scale: number;
  /** yaw; the stalk leans towards local +z */
  rot: number;
  lean: number;
  species: BambooSpecies;
}

/** A young shoot pushing out of the ground at the edge of a clump. */
export interface BambooShoot {
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
}

interface Look {
  base: string;
  top: string;
  node: string;
  /** waxy bloom just below each node */
  bloom: string;
  /** green stripe in the groove of golden culms */
  stripe?: string;
  /** chance that the lowest nodes still carry their papery sheaths */
  sheaths: number;
  /** tint multiplied into the leaf texture */
  leaf: string;
}

const LOOKS: Record<BambooSpecies, Look> = {
  green: {
    base: '#62883a',
    top: '#9fbd5a',
    node: '#4c6a30',
    bloom: '#b3c69c',
    sheaths: 0.55,
    leaf: '#ffffff',
  },
  golden: {
    base: '#c4a64c',
    top: '#d6c46a',
    node: '#8c7535',
    bloom: '#e2d7a6',
    stripe: '#6c9340',
    sheaths: 0.3,
    leaf: '#f6ffdc',
  },
  black: {
    base: '#2e2a2c',
    top: '#4d4538',
    node: '#1b191b',
    bloom: '#76726c',
    sheaths: 0.15,
    leaf: '#eaf6dc',
  },
};

/** Culm heights (m) of the variants built for each species. */
const VARIANTS: Record<BambooSpecies, number[]> = {
  green: [7.5, 9, 10.5],
  golden: [7.8, 9.4],
  black: [6.4, 7.6],
};

const m4 = new Matrix4();
const q = new Quaternion();
const qLean = new Quaternion();
const v3 = new Vector3();
const s3 = new Vector3();
const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);

/** Accumulates vertices for one mesh. */
class Mesher {
  pos: number[] = [];
  col: number[] = [];
  wind: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  idx: number[] = [];

  get count(): number {
    return this.pos.length / 3;
  }

  vert(p: Vector3, c: Color, windH: number, flutter: number): number {
    this.pos.push(p.x, p.y, p.z);
    this.col.push(c.r, c.g, c.b);
    this.wind.push(windH, flutter);
    return this.count - 1;
  }

  build(withNormals: boolean): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('aWind', new BufferAttribute(new Float32Array(this.wind), 2));
    if (this.uv.length) g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    if (withNormals) g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setIndex(this.idx);
    if (!withNormals) g.computeVertexNormals();
    return g;
  }
}

/**
 * A tube through a list of rings: each ring has a centre, a radius and a colour per
 * vertex around it. Used for culms, branches and sheaths.
 */
function tube(
  m: Mesher,
  rings: { c: Vector3; r: number; color: (theta: number) => Color; windH: number }[],
  radial: number,
  axis: Vector3,
): void {
  // frame perpendicular to the (mostly constant) axis
  const u = new Vector3().crossVectors(axis, Math.abs(axis.y) > 0.9 ? X : Y).normalize();
  const w = new Vector3().crossVectors(axis, u).normalize();
  const first = m.count;
  const p = new Vector3();
  for (const ring of rings) {
    for (let k = 0; k <= radial; k++) {
      const th = (k / radial) * Math.PI * 2;
      p.copy(ring.c)
        .addScaledVector(u, Math.cos(th) * ring.r)
        .addScaledVector(w, Math.sin(th) * ring.r);
      m.vert(p, ring.color(th), ring.windH, 0);
    }
  }
  for (let j = 0; j < rings.length - 1; j++) {
    for (let k = 0; k < radial; k++) {
      const a = first + j * (radial + 1) + k;
      const b = a + radial + 1;
      m.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
}

/**
 * One bamboo culm: nodes with a raised ring and a waxy band below, a gentle curve, papery
 * sheaths on the lowest nodes, alternate branches on the upper half and hanging leaf
 * sprays on the branches and at the crown.
 */
function createStalk(
  seed: number,
  height: number,
  look: Look,
): { stalk: BufferGeometry; foliage: BufferGeometry } {
  const rand = new Random(seed);
  const nodes = Math.round(height / 0.4);
  const seg = height / nodes;
  const radial = 8;
  const rBottom = 0.08;
  const rTop = 0.026;
  const bend = rand.range(0.12, 0.35);
  const base = new Color(look.base);
  const top = new Color(look.top);
  const nodeCol = new Color(look.node);
  const bloom = new Color(look.bloom);
  const stripe = look.stripe ? new Color(look.stripe) : null;
  const tmp = new Color();
  const centre = (y: number) => {
    const t = y / height;
    return new Vector3(bend * t * t, y, 0);
  };
  const radius = (y: number) => rBottom + (rTop - rBottom) * Math.pow(y / height, 0.85);
  // the groove (and the branch) alternates sides from one internode to the next
  const grooveAngle = (n: number) => (n % 2 ? Math.PI : 0) + 0.3;
  const bodyColor = (y: number, n: number, shade: number) => (th: number) => {
    tmp.copy(base).lerp(top, Math.pow(y / height, 0.8));
    if (stripe && Math.cos(th - grooveAngle(n)) > 0.72) tmp.lerp(stripe, 0.85);
    // faint streaks along the culm
    tmp.multiplyScalar(shade * (0.95 + 0.07 * Math.sin(th * 3 + n * 1.7)));
    return tmp.clone();
  };

  const culm = new Mesher();
  const rings: Parameters<typeof tube>[1] = [];
  for (let n = 0; n < nodes; n++) {
    const y0 = n * seg;
    const t0 = y0 / height;
    if (n > 0) {
      rings.push({
        c: centre(y0 - 0.012),
        r: radius(y0) * 1.02,
        color: () => tmp.copy(nodeCol).lerp(bloom, 0.15).clone(),
        windH: t0,
      });
      rings.push({ c: centre(y0), r: radius(y0) * 1.12, color: () => nodeCol.clone(), windH: t0 });
      rings.push({
        c: centre(y0 + 0.02),
        r: radius(y0) * 1.03,
        color: bodyColor(y0, n, 0.9),
        windH: t0,
      });
    } else {
      rings.push({ c: centre(0), r: radius(0), color: bodyColor(0, 0, 0.8), windH: 0 });
    }
    const ym = y0 + seg * 0.5;
    rings.push({ c: centre(ym), r: radius(ym), color: bodyColor(ym, n, 1), windH: ym / height });
    const yb = y0 + seg - 0.07;
    rings.push({
      c: centre(yb),
      r: radius(yb),
      color: (th) => bodyColor(yb, n, 1.02)(th).lerp(bloom, 0.45),
      windH: yb / height,
    });
  }
  rings.push({ c: centre(height), r: rTop * 0.4, color: () => top.clone(), windH: 1 });
  tube(culm, rings, radial, Y);

  // Papery sheaths still wrapped around the lowest nodes.
  if (rand.chance(look.sheaths)) {
    const sheathCol = new Color('#b39866');
    const sheathDark = new Color('#7d6441');
    for (let n = 1; n <= 3; n++) {
      const y0 = n * seg;
      const len = seg * rand.range(0.55, 0.85);
      tube(
        culm,
        [0, 0.5, 1].map((f) => ({
          c: centre(y0 + f * len),
          r: radius(y0) * (1.28 - 0.12 * f) + 0.004,
          color: (th: number) =>
            tmp
              .copy(sheathCol)
              .lerp(sheathDark, 0.35 + 0.35 * Math.sin(th * 5 + n + f * 3))
              .clone(),
          windH: (y0 + f * len) / height,
        })),
        radial,
        Y,
      );
    }
  }

  // Branches and leaf sprays.
  const leaves = new Mesher();
  const tint = new Color(look.leaf);
  const card = (at: Vector3, out: Vector3, w: number, h: number, shade: number) => {
    const side = new Vector3(-out.z, 0, out.x).applyAxisAngle(Y, rand.spread(0.5)).normalize();
    const down = new Vector3(0, -1, 0).addScaledVector(out, rand.range(0.25, 0.65)).normalize();
    const lift = at.clone().addScaledVector(Y, 0.12);
    const corners = [
      lift.clone().addScaledVector(side, -w / 2),
      lift.clone().addScaledVector(side, w / 2),
      lift
        .clone()
        .addScaledVector(side, w / 2)
        .addScaledVector(down, h),
      lift
        .clone()
        .addScaledVector(side, -w / 2)
        .addScaledVector(down, h),
    ];
    const uvs = [0, 1, 1, 1, 1, 0, 0, 0];
    const normal = out.clone().lerp(Y, 0.45).normalize();
    const c = tint.clone().multiplyScalar(shade);
    const first = leaves.count;
    corners.forEach((p, k) => {
      leaves.vert(p, c, p.y / height, k < 2 ? 0.3 : 1);
      leaves.nrm.push(normal.x, normal.y, normal.z);
      leaves.uv.push(uvs[k * 2]!, uvs[k * 2 + 1]!);
    });
    leaves.idx.push(first, first + 1, first + 2, first, first + 2, first + 3);
  };

  const firstBranch = Math.floor(nodes * 0.42);
  for (let n = firstBranch; n < nodes; n++) {
    const y0 = n * seg;
    const f = (n - firstBranch) / Math.max(1, nodes - firstBranch);
    const az = grooveAngle(n) + rand.spread(0.45);
    const out = new Vector3(Math.cos(az), 0, Math.sin(az));
    const len = (1.25 - 0.75 * f) * rand.range(0.8, 1.2);
    const rise = rand.range(0.6, 0.95);
    const dir = out.clone().addScaledVector(Y, rise).normalize();
    const start = centre(y0).addScaledVector(out, radius(y0) * 0.8);
    const mid = start.clone().addScaledVector(dir, len * 0.5);
    const tip = start
      .clone()
      .addScaledVector(dir, len)
      .addScaledVector(Y, -len * 0.12);
    const branchCol = () => tmp.copy(base).lerp(top, 0.7).multiplyScalar(0.85).clone();
    tube(
      culm,
      [
        { c: start, r: 0.013, color: branchCol, windH: y0 / height },
        { c: mid, r: 0.009, color: branchCol, windH: (y0 + len * 0.3) / height },
        { c: tip, r: 0.004, color: branchCol, windH: (y0 + len * 0.4) / height },
      ],
      4,
      dir,
    );
    const shade = 0.72 + 0.35 * f + rand.spread(0.06);
    const size = 1 - 0.25 * f;
    card(tip, out, rand.range(0.95, 1.3) * size, rand.range(1.2, 1.6) * size, shade);
    // a second, crossed spray at the tip for volume
    const cross = out.clone().applyAxisAngle(Y, Math.PI / 2 + rand.spread(0.4));
    card(tip, cross, rand.range(0.8, 1.1) * size, rand.range(1.0, 1.4) * size, shade * 0.95);
    if (len > 0.7) card(mid, out, rand.range(0.7, 1.0), rand.range(0.9, 1.2), shade * 0.9);
  }
  // the crown
  const crown = centre(height - 0.15);
  for (let k = 0; k < 4; k++) {
    const az = (k / 4) * Math.PI * 2 + rand.spread(0.5);
    card(
      crown,
      new Vector3(Math.cos(az), 0, Math.sin(az)),
      rand.range(0.8, 1.05),
      rand.range(1.0, 1.35),
      1.08,
    );
  }

  return { stalk: culm.build(false), foliage: leaves.build(true) };
}

/** A young shoot: a pointed cone wrapped in brown sheaths, green at the tip. */
function createShoot(): BufferGeometry {
  const m = new Mesher();
  const brown = new Color('#7b5a36');
  const tan = new Color('#b0915e');
  const green = new Color('#7e9a45');
  const tmp = new Color();
  const rings = [0, 0.18, 0.36, 0.52, 0.66, 0.78, 0.88, 0.95, 1].map((t, i) => ({
    c: new Vector3(0.02 * t * t, t, 0),
    r: 0.1 * Math.pow(1 - t, 0.9) + 0.002,
    color: (th: number) =>
      tmp
        .copy(i % 2 ? brown : tan)
        .lerp(green, Math.max(0, (t - 0.6) / 0.4))
        .multiplyScalar(0.9 + 0.1 * Math.sin(th * 4 + i))
        .clone(),
    windH: 0,
  }));
  tube(m, rings, 8, Y);
  return m.build(false);
}

/**
 * Bamboo groves: several culm variants per species drawn as InstancedMeshes, plus young
 * shoots. Culms sway in the wind and lean away when the panda squeezes between them.
 */
export class Bamboo {
  readonly group = new Group();
  readonly count: number;

  constructor(stalks: BambooStalk[], shoots: BambooShoot[] = []) {
    this.count = stalks.length;
    const stalkMaterial = createVegetationMaterial({
      name: 'bamboo-stalk',
      sway: 0.55,
      push: 0.55,
      pushRadius: 1.4,
      translucency: 0.25,
      roughness: 0.42,
      doubleSided: false,
    });
    const leafMaterial = createVegetationMaterial({
      name: 'bamboo-leaves',
      map: createBambooLeafTexture(),
      alphaTest: 0.4,
      sway: 0.55,
      flutter: 0.05,
      push: 0.55,
      pushRadius: 1.4,
      translucency: 0.5,
      keepNormals: true,
    });

    let seed = 11;
    for (const species of Object.keys(VARIANTS) as BambooSpecies[]) {
      const list = stalks.filter((s) => s.species === species);
      if (!list.length) continue;
      const variants = VARIANTS[species].map((h) => createStalk(seed++, h, LOOKS[species]));
      const buckets: BambooStalk[][] = variants.map(() => []);
      list.forEach((s, i) => buckets[i % variants.length]!.push(s));
      variants.forEach((geo, vi) => {
        const bucket = buckets[vi]!;
        if (!bucket.length) return;
        const matrices = bucket.map((s) => {
          q.setFromAxisAngle(Y, s.rot);
          qLean.setFromAxisAngle(X, s.lean);
          q.multiply(qLean);
          return m4
            .clone()
            .compose(v3.set(s.x, s.y - 0.1, s.z), q, s3.set(s.scale, s.scale, s.scale));
        });
        for (const [part, g, mat] of [
          ['stalk', geo.stalk, stalkMaterial],
          ['leaves', geo.foliage, leafMaterial],
        ] as const) {
          // Thin culms barely show in shadows; only the leaves cast them.
          for (const mesh of chunkedInstances(g, mat, matrices, {
            name: `bamboo-${species}-${part}-${vi}`,
            chunk: Infinity,
            castShadow: part === 'leaves',
          })) {
            this.group.add(mesh);
          }
        }
      });
    }

    if (shoots.length) {
      const matrices = shoots.map((s) => {
        q.setFromAxisAngle(Y, s.rot);
        return m4
          .clone()
          .compose(v3.set(s.x, s.y - 0.04, s.z), q, s3.set(s.scale, s.scale, s.scale));
      });
      for (const mesh of chunkedInstances(createShoot(), stalkMaterial, matrices, {
        name: 'bamboo-shoots',
        chunk: Infinity,
        castShadow: false,
      })) {
        this.group.add(mesh);
      }
    }
  }

  addTo(scene: Scene): void {
    scene.add(this.group);
  }
}
