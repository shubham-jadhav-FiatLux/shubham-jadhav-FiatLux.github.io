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

const sj_LOOKS: Record<BambooSpecies, Look> = {
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
const sj_VARIANTS: Record<BambooSpecies, number[]> = {
  green: [7.5, 9, 10.5],
  golden: [7.8, 9.4],
  black: [6.4, 7.6],
};

const sj_m4 = new Matrix4();
const sj_q = new Quaternion();
const sj_qLean = new Quaternion();
const sj_v3 = new Vector3();
const sj_s3 = new Vector3();
const sj_X = new Vector3(1, 0, 0);
const sj_Y = new Vector3(0, 1, 0);

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
  vert(
    sj_p: Vector3,
    sj_c: Color,
    sj_windH: number,
    sj_flutter: number,
    sj_culm = sj_NO_CULM,
  ): number {
    this.pos.push(sj_p.x, sj_p.y, sj_p.z);
    this.col.push(sj_c.r, sj_c.g, sj_c.b);
    this.wind.push(sj_windH, sj_flutter);
    this.culm.push(sj_culm[0], sj_culm[1], sj_culm[2], sj_culm[3]);
    return this.count - 1;
  }

  build(sj_withNormals: boolean, sj_withCulm: boolean): BufferGeometry {
    const sj_g = new BufferGeometry();
    sj_g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    sj_g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    sj_g.setAttribute('aWind', new BufferAttribute(new Float32Array(this.wind), 2));
    if (sj_withCulm)
      sj_g.setAttribute('aCulm', new BufferAttribute(new Float32Array(this.culm), 4));
    if (this.uv.length) sj_g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    if (sj_withNormals)
      sj_g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    sj_g.setIndex(this.idx);
    if (!sj_withNormals) sj_g.computeVertexNormals();
    return sj_g;
  }
}

type CulmAttr = [number, number, number, number];
/** mid-internode, no direction: no rings, bloom or stripe */
const sj_NO_CULM: CulmAttr = [0.5, 0, 0, 0];

interface Ring {
  c: Vector3;
  r: number;
  color: (sj_theta: number) => Color;
  windH: number;
  /** position along the culm in internodes (culm rings only) */
  node?: number;
}

/**
 * A tube through a list of rings: each ring has a centre, a radius and a colour per
 * vertex around it. Used for culms, branches and sheaths.
 */
function tube(
  sj_m: Mesher,
  sj_rings: Ring[],
  sj_radial: number,
  sj_axis: Vector3,
  sj_stripe = 0,
): void {
  // frame perpendicular to the (mostly constant) axis
  const sj_u = new Vector3()
    .crossVectors(sj_axis, Math.abs(sj_axis.y) > 0.9 ? sj_X : sj_Y)
    .normalize();
  const sj_w = new Vector3().crossVectors(sj_axis, sj_u).normalize();
  const sj_first = sj_m.count;
  const sj_p = new Vector3();
  for (const sj_ring of sj_rings) {
    for (let sj_k = 0; sj_k <= sj_radial; sj_k++) {
      const sj_th = (sj_k / sj_radial) * Math.PI * 2;
      sj_p
        .copy(sj_ring.c)
        .addScaledVector(sj_u, Math.cos(sj_th) * sj_ring.r)
        .addScaledVector(sj_w, Math.sin(sj_th) * sj_ring.r);
      const sj_culm: CulmAttr =
        sj_ring.node === undefined
          ? sj_NO_CULM
          : [sj_ring.node, Math.cos(sj_th), Math.sin(sj_th), sj_stripe];
      sj_m.vert(sj_p, sj_ring.color(sj_th), sj_ring.windH, 0, sj_culm);
    }
  }
  for (let sj_j = 0; sj_j < sj_rings.length - 1; sj_j++) {
    for (let sj_k = 0; sj_k < sj_radial; sj_k++) {
      const sj_a = sj_first + sj_j * (sj_radial + 1) + sj_k;
      const sj_b = sj_a + sj_radial + 1;
      // counter-clockwise seen from outside, so faces (and normals) point outwards
      sj_m.idx.push(sj_a, sj_a + 1, sj_b, sj_a + 1, sj_b + 1, sj_b);
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
  sj_seed: number,
  sj_height: number,
  sj_look: Look,
): { stalk: BufferGeometry; foliage: BufferGeometry } {
  const sj_rand = new Random(sj_seed);
  const sj_nodes = Math.round(sj_height / 0.42);
  const sj_seg = sj_height / sj_nodes;
  const sj_radial = 7;
  const sj_rBottom = 0.08;
  const sj_rTop = 0.026;
  const sj_bend = sj_rand.range(0.12, 0.35);
  const sj_base = new Color(sj_look.base);
  const sj_top = new Color(sj_look.top);
  const sj_tmp = new Color();
  const sj_centre = (sj_y: number) => {
    const sj_t = sj_y / sj_height;
    return new Vector3(sj_bend * sj_t * sj_t, sj_y, 0);
  };
  const sj_radius = (sj_y: number) =>
    sj_rBottom + (sj_rTop - sj_rBottom) * Math.pow(sj_y / sj_height, 0.85);
  // the groove (and the branch) alternates sides from one internode to the next
  const sj_grooveAngle = (sj_n: number) => (sj_n % 2 ? Math.PI : 0) + 0.3;

  const sj_culm = new Mesher();
  const sj_rings: Ring[] = [];
  const sj_steps = Math.ceil(sj_height / 0.75);
  for (let sj_k = 0; sj_k <= sj_steps; sj_k++) {
    const sj_y = (sj_k / sj_steps) * sj_height;
    const sj_t = sj_y / sj_height;
    sj_rings.push({
      c: sj_centre(sj_y),
      r: sj_k === sj_steps ? sj_rTop * 0.5 : sj_radius(sj_y),
      // base-to-tip gradient with faint streaks along the culm
      color: (sj_th) =>
        sj_tmp
          .copy(sj_base)
          .lerp(sj_top, Math.pow(sj_t, 0.8))
          .multiplyScalar((sj_k === 0 ? 0.85 : 1) * (0.95 + 0.07 * Math.sin(sj_th * 3 + 1.7)))
          .clone(),
      windH: sj_t,
      node: sj_y / sj_seg,
    });
  }
  tube(sj_culm, sj_rings, sj_radial, sj_Y, sj_look.stripe ? 1 : 0);

  // Papery sheaths still wrapped around the lowest nodes.
  if (sj_rand.chance(sj_look.sheaths)) {
    const sj_sheathCol = new Color('#c4ad7e');
    const sj_sheathDark = new Color('#94794f');
    for (let sj_n = 1; sj_n <= 2; sj_n++) {
      const sj_y0 = sj_n * sj_seg;
      const sj_len = sj_seg * sj_rand.range(0.35, 0.55);
      tube(
        sj_culm,
        [0, 1].map((sj_f) => ({
          c: sj_centre(sj_y0 + sj_f * sj_len),
          r: sj_radius(sj_y0) * (1.1 - 0.06 * sj_f) + 0.003,
          color: (sj_th: number) =>
            sj_tmp
              .copy(sj_sheathCol)
              .lerp(sj_sheathDark, 0.35 + 0.35 * Math.sin(sj_th * 5 + sj_n + sj_f * 3))
              .clone(),
          windH: (sj_y0 + sj_f * sj_len) / sj_height,
        })),
        sj_radial,
        sj_Y,
      );
    }
  }

  // Branches and leaf sprays.
  const sj_leaves = new Mesher();
  const sj_tint = new Color(sj_look.leaf);
  const sj_card = (
    sj_at: Vector3,
    sj_out: Vector3,
    sj_w: number,
    sj_h: number,
    sj_shade: number,
  ) => {
    const sj_side = new Vector3(-sj_out.z, 0, sj_out.x)
      .applyAxisAngle(sj_Y, sj_rand.spread(0.5))
      .normalize();
    const sj_down = new Vector3(0, -1, 0)
      .addScaledVector(sj_out, sj_rand.range(0.25, 0.65))
      .normalize();
    const sj_lift = sj_at.clone().addScaledVector(sj_Y, 0.12);
    const sj_corners = [
      sj_lift.clone().addScaledVector(sj_side, -sj_w / 2),
      sj_lift.clone().addScaledVector(sj_side, sj_w / 2),
      sj_lift
        .clone()
        .addScaledVector(sj_side, sj_w / 2)
        .addScaledVector(sj_down, sj_h),
      sj_lift
        .clone()
        .addScaledVector(sj_side, -sj_w / 2)
        .addScaledVector(sj_down, sj_h),
    ];
    const sj_uvs = [0, 1, 1, 1, 1, 0, 0, 0];
    const sj_normal = sj_out.clone().lerp(sj_Y, 0.45).normalize();
    const sj_c = sj_tint.clone().multiplyScalar(sj_shade);
    const sj_first = sj_leaves.count;
    sj_corners.forEach((sj_p, sj_k) => {
      sj_leaves.vert(sj_p, sj_c, sj_p.y / sj_height, sj_k < 2 ? 0.3 : 1);
      sj_leaves.nrm.push(sj_normal.x, sj_normal.y, sj_normal.z);
      sj_leaves.uv.push(sj_uvs[sj_k * 2]!, sj_uvs[sj_k * 2 + 1]!);
    });
    sj_leaves.idx.push(sj_first, sj_first + 1, sj_first + 2, sj_first, sj_first + 2, sj_first + 3);
  };

  const sj_firstBranch = Math.floor(sj_nodes * 0.42);
  for (let sj_n = sj_firstBranch; sj_n < sj_nodes; sj_n++) {
    const sj_y0 = sj_n * sj_seg;
    const sj_f = (sj_n - sj_firstBranch) / Math.max(1, sj_nodes - sj_firstBranch);
    const sj_az = sj_grooveAngle(sj_n) + sj_rand.spread(0.45);
    const sj_out = new Vector3(Math.cos(sj_az), 0, Math.sin(sj_az));
    const sj_len = (1.25 - 0.75 * sj_f) * sj_rand.range(0.8, 1.2);
    const sj_rise = sj_rand.range(0.6, 0.95);
    const sj_dir = sj_out.clone().addScaledVector(sj_Y, sj_rise).normalize();
    const sj_start = sj_centre(sj_y0).addScaledVector(sj_out, sj_radius(sj_y0) * 0.8);
    const sj_mid = sj_start.clone().addScaledVector(sj_dir, sj_len * 0.5);
    const sj_tip = sj_start
      .clone()
      .addScaledVector(sj_dir, sj_len)
      .addScaledVector(sj_Y, -sj_len * 0.12);
    const sj_branchCol = () => sj_tmp.copy(sj_base).lerp(sj_top, 0.7).multiplyScalar(0.85).clone();
    tube(
      sj_culm,
      [
        { c: sj_start, r: 0.013, color: sj_branchCol, windH: sj_y0 / sj_height },
        { c: sj_mid, r: 0.009, color: sj_branchCol, windH: (sj_y0 + sj_len * 0.3) / sj_height },
        { c: sj_tip, r: 0.004, color: sj_branchCol, windH: (sj_y0 + sj_len * 0.4) / sj_height },
      ],
      3,
      sj_dir,
    );
    const sj_shade = 0.72 + 0.35 * sj_f + sj_rand.spread(0.06);
    const sj_size = 1 - 0.25 * sj_f;
    sj_card(
      sj_tip,
      sj_out,
      sj_rand.range(0.95, 1.3) * sj_size,
      sj_rand.range(1.2, 1.6) * sj_size,
      sj_shade,
    );
    // a second, crossed spray at the tip for volume
    const sj_cross = sj_out.clone().applyAxisAngle(sj_Y, Math.PI / 2 + sj_rand.spread(0.4));
    sj_card(
      sj_tip,
      sj_cross,
      sj_rand.range(0.8, 1.1) * sj_size,
      sj_rand.range(1.0, 1.4) * sj_size,
      sj_shade * 0.95,
    );
    if (sj_len > 0.7)
      sj_card(sj_mid, sj_out, sj_rand.range(0.7, 1.0), sj_rand.range(0.9, 1.2), sj_shade * 0.9);
  }
  // the crown
  const sj_crown = sj_centre(sj_height - 0.15);
  for (let sj_k = 0; sj_k < 4; sj_k++) {
    const sj_az = (sj_k / 4) * Math.PI * 2 + sj_rand.spread(0.5);
    sj_card(
      sj_crown,
      new Vector3(Math.cos(sj_az), 0, Math.sin(sj_az)),
      sj_rand.range(0.8, 1.05),
      sj_rand.range(1.0, 1.35),
      1.08,
    );
  }

  return { stalk: sj_culm.build(false, true), foliage: sj_leaves.build(true, false) };
}

/** A young shoot: a pointed cone wrapped in brown sheaths, green at the tip. */
function createShoot(): BufferGeometry {
  const sj_m = new Mesher();
  const sj_brown = new Color('#7b5a36');
  const sj_tan = new Color('#b0915e');
  const sj_green = new Color('#7e9a45');
  const sj_tmp = new Color();
  const sj_rings = [0, 0.18, 0.36, 0.52, 0.66, 0.78, 0.88, 0.95, 1].map((sj_t, sj_i) => ({
    c: new Vector3(0.02 * sj_t * sj_t, sj_t, 0),
    r: 0.1 * Math.pow(1 - sj_t, 0.9) + 0.002,
    color: (sj_th: number) =>
      sj_tmp
        .copy(sj_i % 2 ? sj_brown : sj_tan)
        .lerp(sj_green, Math.max(0, (sj_t - 0.6) / 0.4))
        .multiplyScalar(0.9 + 0.1 * Math.sin(sj_th * 4 + sj_i))
        .clone(),
    windH: 0,
  }));
  tube(sj_m, sj_rings, 8, sj_Y);
  return sj_m.build(false, true);
}

/**
 * Bamboo groves: several culm variants per species drawn as InstancedMeshes, plus young
 * shoots. Culms sway in the wind and lean away when the panda squeezes between them.
 */
export class Bamboo {
  readonly group = new Group();
  readonly count: number;

  constructor(sj_stalks: BambooStalk[], sj_shoots: BambooShoot[] = []) {
    this.count = sj_stalks.length;
    const sj_stalkMaterials = {} as Record<BambooSpecies, MeshStandardMaterial>;
    for (const sj_species of Object.keys(sj_LOOKS) as BambooSpecies[]) {
      const sj_look = sj_LOOKS[sj_species];
      sj_stalkMaterials[sj_species] = createVegetationMaterial({
        name: `bamboo-stalk-${sj_species}`,
        sway: 0.55,
        push: 0.55,
        pushRadius: 1.4,
        translucency: 0.25,
        roughness: 0.42,
        doubleSided: false,
        culm: {
          node: new Color(sj_look.node),
          bloom: new Color(sj_look.bloom),
          stripe: new Color(sj_look.stripe ?? sj_look.base),
        },
      });
    }
    const sj_leafMaterial = createVegetationMaterial({
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

    let sj_seed = 11;
    for (const sj_species of Object.keys(sj_VARIANTS) as BambooSpecies[]) {
      const sj_list = sj_stalks.filter((sj_s) => sj_s.species === sj_species);
      if (!sj_list.length) continue;
      const sj_variants = sj_VARIANTS[sj_species].map((sj_h) =>
        createStalk(sj_seed++, sj_h, sj_LOOKS[sj_species]),
      );
      const sj_buckets: BambooStalk[][] = sj_variants.map(() => []);
      sj_list.forEach((sj_s, sj_i) => sj_buckets[sj_i % sj_variants.length]!.push(sj_s));
      sj_variants.forEach((sj_geo, sj_vi) => {
        const sj_bucket = sj_buckets[sj_vi]!;
        if (!sj_bucket.length) return;
        const sj_matrices = sj_bucket.map((sj_s) => {
          sj_q.setFromAxisAngle(sj_Y, sj_s.rot);
          sj_qLean.setFromAxisAngle(sj_X, sj_s.lean);
          sj_q.multiply(sj_qLean);
          return sj_m4
            .clone()
            .compose(
              sj_v3.set(sj_s.x, sj_s.y - 0.1, sj_s.z),
              sj_q,
              sj_s3.set(sj_s.scale, sj_s.scale, sj_s.scale),
            );
        });
        for (const [sj_part, sj_g, sj_mat] of [
          ['stalk', sj_geo.stalk, sj_stalkMaterials[sj_species]],
          ['leaves', sj_geo.foliage, sj_leafMaterial],
        ] as const) {
          // Thin culms barely show in shadows; only the leaves cast them.
          for (const sj_mesh of chunkedInstances(sj_g, sj_mat, sj_matrices, {
            name: `bamboo-${sj_species}-${sj_part}-${sj_vi}`,
            chunk: Infinity,
            castShadow: sj_part === 'leaves',
          })) {
            this.group.add(sj_mesh);
          }
        }
      });
    }

    if (sj_shoots.length) {
      const sj_matrices = sj_shoots.map((sj_s) => {
        sj_q.setFromAxisAngle(sj_Y, sj_s.rot);
        return sj_m4
          .clone()
          .compose(
            sj_v3.set(sj_s.x, sj_s.y - 0.04, sj_s.z),
            sj_q,
            sj_s3.set(sj_s.scale, sj_s.scale, sj_s.scale),
          );
      });
      for (const sj_mesh of chunkedInstances(createShoot(), sj_stalkMaterials.green, sj_matrices, {
        name: 'bamboo-shoots',
        chunk: Infinity,
        castShadow: false,
      })) {
        this.group.add(sj_mesh);
      }
    }
  }

  addTo(sj_scene: Scene): void {
    sj_scene.add(this.group);
  }
}
