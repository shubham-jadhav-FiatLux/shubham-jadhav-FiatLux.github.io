import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Matrix4,
  Quaternion,
  type MeshStandardMaterial,
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
  culm: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  idx: number[] = [];

  get count(): number {
    return this.pos.length / 3;
  }

  /**
   * `culm` (for the culm shader): x = position in internodes along the culm, (y, z) = the
   * direction around it, w = 1 where the groove is striped. Zero for leaves and twigs.
   */
  vert(p: Vector3, c: Color, windH: number, flutter: number, culm = NO_CULM): number {
    this.pos.push(p.x, p.y, p.z);
    this.col.push(c.r, c.g, c.b);
    this.wind.push(windH, flutter);
    this.culm.push(culm[0], culm[1], culm[2], culm[3]);
    return this.count - 1;
  }

  build(withNormals: boolean, withCulm: boolean): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('aWind', new BufferAttribute(new Float32Array(this.wind), 2));
    if (withCulm) g.setAttribute('aCulm', new BufferAttribute(new Float32Array(this.culm), 4));
    if (this.uv.length) g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    if (withNormals) g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setIndex(this.idx);
    if (!withNormals) g.computeVertexNormals();
    return g;
  }
}

type CulmAttr = [number, number, number, number];
/** mid-internode, no direction: no rings, bloom or stripe */
const NO_CULM: CulmAttr = [0.5, 0, 0, 0];

interface Ring {
  c: Vector3;
  r: number;
  color: (theta: number) => Color;
  windH: number;
  /** position along the culm in internodes (culm rings only) */
  node?: number;
}

/**
 * A tube through a list of rings: each ring has a centre, a radius and a colour per
 * vertex around it. Used for culms, branches and sheaths.
 */
function tube(m: Mesher, rings: Ring[], radial: number, axis: Vector3, stripe = 0): void {
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
      const culm: CulmAttr =
        ring.node === undefined ? NO_CULM : [ring.node, Math.cos(th), Math.sin(th), stripe];
      m.vert(p, ring.color(th), ring.windH, 0, culm);
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
 * One bamboo culm: a gently curved, tapering tube (node rings, the waxy bloom below each
 * node and the striped grooves of golden culms are drawn by the culm shader), papery
 * sheaths on the lowest nodes, alternate branches on the upper half and hanging leaf
 * sprays on the branches and at the crown.
 */
function createStalk(
  seed: number,
  height: number,
  look: Look,
): { stalk: BufferGeometry; foliage: BufferGeometry } {
  const rand = new Random(seed);
  const nodes = Math.round(height / 0.42);
  const seg = height / nodes;
  const radial = 7;
  const rBottom = 0.08;
  const rTop = 0.026;
  const bend = rand.range(0.12, 0.35);
  const base = new Color(look.base);
  const top = new Color(look.top);
  const tmp = new Color();
  const centre = (y: number) => {
    const t = y / height;
    return new Vector3(bend * t * t, y, 0);
  };
  const radius = (y: number) => rBottom + (rTop - rBottom) * Math.pow(y / height, 0.85);
  // the groove (and the branch) alternates sides from one internode to the next
  const grooveAngle = (n: number) => (n % 2 ? Math.PI : 0) + 0.3;

  const culm = new Mesher();
  const rings: Ring[] = [];
  const steps = Math.ceil(height / 0.75);
  for (let k = 0; k <= steps; k++) {
    const y = (k / steps) * height;
    const t = y / height;
    rings.push({
      c: centre(y),
      r: k === steps ? rTop * 0.5 : radius(y),
      // base-to-tip gradient with faint streaks along the culm
      color: (th) =>
        tmp
          .copy(base)
          .lerp(top, Math.pow(t, 0.8))
          .multiplyScalar((k === 0 ? 0.85 : 1) * (0.95 + 0.07 * Math.sin(th * 3 + 1.7)))
          .clone(),
      windH: t,
      node: y / seg,
    });
  }
  tube(culm, rings, radial, Y, look.stripe ? 1 : 0);

  // Papery sheaths still wrapped around the lowest nodes.
  if (rand.chance(look.sheaths)) {
    const sheathCol = new Color('#b39866');
    const sheathDark = new Color('#7d6441');
    for (let n = 1; n <= 3; n++) {
      const y0 = n * seg;
      const len = seg * rand.range(0.55, 0.85);
      tube(
        culm,
        [0, 1].map((f) => ({
          c: centre(y0 + f * len),
          r: radius(y0) * (1.22 - 0.1 * f) + 0.004,
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
      3,
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

  return { stalk: culm.build(false, true), foliage: leaves.build(true, false) };
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
  return m.build(false, true);
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
    const stalkMaterials = {} as Record<BambooSpecies, MeshStandardMaterial>;
    for (const species of Object.keys(LOOKS) as BambooSpecies[]) {
      const look = LOOKS[species];
      stalkMaterials[species] = createVegetationMaterial({
        name: `bamboo-stalk-${species}`,
        sway: 0.55,
        push: 0.55,
        pushRadius: 1.4,
        translucency: 0.25,
        roughness: 0.42,
        doubleSided: false,
        culm: {
          node: new Color(look.node),
          bloom: new Color(look.bloom),
          stripe: new Color(look.stripe ?? look.base),
        },
      });
    }
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
          ['stalk', geo.stalk, stalkMaterials[species]],
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
      for (const mesh of chunkedInstances(createShoot(), stalkMaterials.green, matrices, {
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
