import { BufferAttribute, BufferGeometry, Mesh, Vector2, type Scene } from 'three';
import { Random } from '../../utils/random';
import { SimplexNoise } from '../../utils/noise';
import { lerp } from '../../utils/math';
import type { QualityLevel } from '../../core/Quality';
import {
  buildPeak,
  ledgesOf,
  perches,
  type PeakKind,
  type PeakMesh,
  type PeakSpec,
  type Resolution,
} from './peaks';
import { buildConifer, buildPine, buildShrub } from './pines';
import { createMountainMaterial } from './mountainMaterial';
import { createCloudSea, createMistBand, type MistBand } from './Mist';
import { buildSkirt } from './skirt';

/** One range of peaks in a band of distance around the valley. */
export interface RangeDef {
  name: string;
  /** distance band from the centre of the valley (m) */
  inner: number;
  outer: number;
  /** groups of peaks around the full circle */
  clusters: number;
  /** summit heights above the water (m) */
  heights: [number, number];
  /** how often each kind of peak appears */
  kinds: Partial<Record<PeakKind, number>>;
  /** smaller peaks huddled around each main one */
  satellites: [number, number];
  /** chance that a group is left out, opening a window onto the ranges behind */
  gaps: number;
  /** no footprint reaches closer to the valley than this (m) */
  keepOut: number;
  base: number;
  /** mesh resolution on high quality */
  res: Resolution;
  hazeDensity: number;
  hazeMin: number;
  /** mist: thick at y = mist[0], clear at mist[1] */
  mist: [number, number];
  /** pines per peak on high quality, and their size */
  trees: number;
  treeSize: [number, number];
  /** clumps of scrub per peak on high quality: on the crown, along ledges, on the cliffs */
  scrub: { crown: number; ledge: number; cliff: number; size: [number, number] };
  seed: number;
}

/** Footprint radius as a fraction of the height, per kind of peak. */
const sj_WIDTH: Record<PeakKind, [number, number]> = {
  karst: [0.15, 0.27],
  spire: [0.11, 0.18],
  massif: [0.75, 1.05],
  dome: [1.1, 1.7],
};

/** Where trees grow on each kind of peak (height fractions) and how far they lean out. */
const sj_TREES: Record<PeakKind, { t: [number, number]; share: number; reach: number }> = {
  karst: { t: [0.78, 0.985], share: 1, reach: 0.6 },
  spire: { t: [0.72, 0.97], share: 0, reach: 0.9 },
  massif: { t: [0.55, 0.85], share: 0.3, reach: 0.3 },
  dome: { t: [0.35, 0.95], share: 1, reach: 0 },
};

/**
 * The ranges around the valley, nearest first: the karst towers, then ever paler and
 * higher ranges into the distance.
 */
export const sj_RANGES: RangeDef[] = [
  {
    name: 'towers',
    inner: 182,
    outer: 262,
    clusters: 28,
    heights: [62, 150],
    kinds: { karst: 0.55, spire: 0.45 },
    satellites: [1, 3],
    gaps: 0.18,
    keepOut: 140,
    base: -10,
    res: { around: 38, rings: 26 },
    hazeDensity: 0.0016,
    hazeMin: 0,
    mist: [24, 62],
    trees: 4,
    treeSize: [7, 11],
    scrub: { crown: 70, ledge: 14, cliff: 6, size: [1.7, 3.1] },
    seed: 23,
  },
  {
    name: 'ranges',
    inner: 330,
    outer: 470,
    clusters: 28,
    heights: [150, 290],
    kinds: { karst: 0.4, spire: 0.25, massif: 0.35 },
    satellites: [0, 2],
    gaps: 0.08,
    keepOut: 250,
    base: -10,
    res: { around: 30, rings: 18 },
    hazeDensity: 0.0017,
    hazeMin: 0.12,
    mist: [45, 118],
    trees: 0,
    treeSize: [0, 0],
    scrub: { crown: 26, ledge: 6, cliff: 0, size: [3.8, 6.2] },
    seed: 37,
  },
  {
    name: 'far',
    inner: 640,
    outer: 880,
    clusters: 24,
    heights: [240, 420],
    kinds: { massif: 0.75, karst: 0.25 },
    satellites: [0, 1],
    gaps: 0,
    keepOut: 480,
    base: -10,
    res: { around: 30, rings: 16 },
    hazeDensity: 0.0012,
    hazeMin: 0.3,
    mist: [70, 180],
    trees: 0,
    treeSize: [0, 0],
    scrub: { crown: 0, ledge: 0, cliff: 0, size: [0, 0] },
    seed: 41,
  },
  {
    name: 'distant',
    inner: 1150,
    outer: 1450,
    clusters: 20,
    heights: [380, 640],
    kinds: { massif: 1 },
    satellites: [0, 1],
    gaps: 0,
    keepOut: 850,
    base: -20,
    res: { around: 24, rings: 12 },
    hazeDensity: 0.001,
    hazeMin: 0.45,
    mist: [90, 260],
    trees: 0,
    treeSize: [0, 0],
    scrub: { crown: 0, ledge: 0, cliff: 0, size: [0, 0] },
    seed: 53,
  },
];

/** Bands of mist between the ranges, so each rises out of its own layer of cloud. */
export const sj_MIST_BANDS: MistBand[] = [
  { radius: 176, y0: 26, y1: 70, alpha: 0.72 },
  { radius: 300, y0: 34, y1: 120, alpha: 0.68 },
  { radius: 560, y0: 50, y1: 178, alpha: 0.64 },
  { radius: 1000, y0: 70, y1: 262, alpha: 0.6 },
];

/** The sea of cloud below the rim. */
export const sj_CLOUD_SEA = { height: 27, inner: 118, outer: 2300 };

const sj_QUALITY: Record<QualityLevel, { res: number; trees: number; detail: boolean }> = {
  low: { res: 0.6, trees: 0.45, detail: false },
  medium: { res: 0.8, trees: 0.75, detail: true },
  high: { res: 1, trees: 1, detail: true },
};

const sj_shapeNoise = new SimplexNoise(5150);

function pick<K extends string>(sj_rand: Random, sj_weights: Partial<Record<K, number>>): K {
  const sj_entries = Object.entries(sj_weights) as [K, number][];
  let sj_total = 0;
  for (const [, sj_w] of sj_entries) sj_total += sj_w;
  let sj_r = sj_rand.float() * sj_total;
  for (const [sj_k, sj_w] of sj_entries) {
    sj_r -= sj_w;
    if (sj_r <= 0) return sj_k;
  }
  return sj_entries[sj_entries.length - 1]![0];
}

/** The peaks of one range (pure data; deterministic for a given definition). */
export function planRange(sj_range: RangeDef): PeakSpec[] {
  const sj_rand = new Random(sj_range.seed);
  const sj_specs: PeakSpec[] = [];
  for (let sj_i = 0; sj_i < sj_range.clusters; sj_i++) {
    const sj_a = ((sj_i + sj_rand.range(-0.3, 0.3)) / sj_range.clusters) * Math.PI * 2;
    if (sj_rand.chance(sj_range.gaps)) continue;
    const sj_r = lerp(sj_range.inner, sj_range.outer, sj_rand.range(0.15, 0.85));
    // Heights rise and fall around the circle in long swells, so the skyline has
    // groups of high peaks and quieter stretches rather than even teeth.
    const sj_swell =
      0.5 +
      0.5 *
        sj_shapeNoise.noise2(
          Math.cos(sj_a) * 1.6 + sj_range.seed,
          Math.sin(sj_a) * 1.6 - sj_range.seed,
        );
    const sj_k = Math.min(1, Math.max(0, sj_swell * 0.75 + sj_rand.float() * 0.35));
    const sj_kind = pick(sj_rand, sj_range.kinds);
    const sj_height = lerp(sj_range.heights[0], sj_range.heights[1], sj_k);
    const sj_main: PeakSpec = {
      kind: sj_kind,
      x: Math.cos(sj_a) * sj_r,
      z: Math.sin(sj_a) * sj_r,
      base: sj_range.base,
      height: sj_height - sj_range.base,
      radius: Math.min(
        sj_r - sj_range.keepOut,
        (sj_height - sj_range.base) * sj_rand.range(...sj_WIDTH[sj_kind]),
      ),
      lean: sj_kind === 'karst' || sj_kind === 'spire' ? sj_rand.range(0, 0.1) : 0,
      leanAngle: sj_rand.range(0, Math.PI * 2),
      seed: sj_range.seed * 1000 + sj_i * 10,
    };
    sj_specs.push(sj_main);
    const sj_satellites = sj_rand.int(sj_range.satellites[0], sj_range.satellites[1]);
    for (let sj_s = 0; sj_s < sj_satellites; sj_s++) {
      const sj_sk: PeakKind = sj_kind === 'dome' ? 'dome' : sj_rand.chance(0.6) ? sj_kind : 'spire';
      const sj_h = sj_main.height * sj_rand.range(0.42, 0.78);
      const sj_ang = sj_rand.range(0, Math.PI * 2);
      const sj_off = sj_main.radius * sj_rand.range(0.55, 1.05);
      const sj_sx = sj_main.x + Math.cos(sj_ang) * sj_off;
      const sj_sz = sj_main.z + Math.sin(sj_ang) * sj_off;
      const sj_room = Math.hypot(sj_sx, sj_sz) - sj_range.keepOut;
      if (sj_room < 6) continue;
      sj_specs.push({
        kind: sj_sk,
        x: sj_sx,
        z: sj_sz,
        base: sj_range.base,
        height: sj_h,
        radius: Math.min(sj_room, sj_h * sj_rand.range(...sj_WIDTH[sj_sk])),
        lean: sj_sk === 'karst' || sj_sk === 'spire' ? sj_rand.range(0, 0.12) : 0,
        leanAngle: sj_rand.range(0, Math.PI * 2),
        seed: sj_main.seed + sj_s + 1,
      });
    }
  }
  return sj_specs;
}

/**
 * Each range is cut into sectors round the valley, one mesh each, so the camera skips
 * the ones behind or beside it (a single mesh for a whole ring of mountains is always
 * drawn in full).
 */
const sj_SECTORS = 8;

/** Groups the parts of a range by the direction they lie in, seen from the valley. */
function bySector(sj_parts: PeakMesh[]): PeakMesh[][] {
  const sj_groups: PeakMesh[][] = Array.from({ length: sj_SECTORS }, () => []);
  for (const sj_p of sj_parts) {
    let sj_x = 0;
    let sj_z = 0;
    const sj_n = sj_p.positions.length / 3;
    for (let sj_i = 0; sj_i < sj_n; sj_i++) {
      sj_x += sj_p.positions[sj_i * 3]!;
      sj_z += sj_p.positions[sj_i * 3 + 2]!;
    }
    const sj_a = Math.atan2(sj_z / sj_n, sj_x / sj_n);
    sj_groups[Math.floor(((sj_a + Math.PI) / (Math.PI * 2)) * sj_SECTORS) % sj_SECTORS]!.push(sj_p);
  }
  return sj_groups.filter((sj_g) => sj_g.length > 0);
}

/** Concatenates meshes into one geometry with smooth normals. */
function merge(sj_parts: PeakMesh[]): BufferGeometry {
  let sj_vertices = 0;
  let sj_indices = 0;
  for (const sj_p of sj_parts) {
    sj_vertices += sj_p.positions.length / 3;
    sj_indices += sj_p.indices.length;
  }
  const sj_positions = new Float32Array(sj_vertices * 3);
  const sj_info = new Float32Array(sj_vertices * 3);
  const sj_index = new Uint32Array(sj_indices);
  let sj_v = 0;
  let sj_o = 0;
  for (const sj_p of sj_parts) {
    sj_positions.set(sj_p.positions, sj_v * 3);
    sj_info.set(sj_p.info, sj_v * 3);
    for (let sj_i = 0; sj_i < sj_p.indices.length; sj_i++)
      sj_index[sj_o + sj_i] = sj_p.indices[sj_i]! + sj_v;
    sj_v += sj_p.positions.length / 3;
    sj_o += sj_p.indices.length;
  }
  const sj_geo = new BufferGeometry();
  sj_geo.setAttribute('position', new BufferAttribute(sj_positions, 3));
  sj_geo.setAttribute('aInfo', new BufferAttribute(sj_info, 3));
  sj_geo.setIndex(new BufferAttribute(sj_index, 1));
  sj_geo.computeVertexNormals();
  // parts that bring their own shading normals keep them
  const sj_normal = sj_geo.getAttribute('normal') as BufferAttribute;
  sj_v = 0;
  for (const sj_p of sj_parts) {
    if (sj_p.normals) (sj_normal.array as Float32Array).set(sj_p.normals, sj_v * 3);
    sj_v += sj_p.positions.length / 3;
  }
  sj_geo.computeBoundingSphere();
  return sj_geo;
}

/**
 * The mountains around the valley: layered ranges of karst towers and peaks that grow
 * paler with distance, each rising out of its own band of mist above a sea of cloud.
 */
export class Mountains {
  readonly meshes: Mesh[] = [];

  constructor(sj_level: QualityLevel) {
    const sj_q = sj_QUALITY[sj_level];
    for (const sj_range of sj_RANGES) {
      const sj_specs = planRange(sj_range);
      const sj_tallest = Math.max(...sj_specs.map((sj_s) => sj_s.height));
      const sj_parts: PeakMesh[] = sj_specs.map((sj_s) => {
        // smaller peaks get fewer vertices
        const sj_k = sj_q.res * Math.max(0.6, Math.sqrt(sj_s.height / sj_tallest));
        const sj_res: Resolution = {
          around: Math.max(12, Math.round(sj_range.res.around * sj_k)),
          rings: Math.max(8, Math.round(sj_range.res.rings * sj_k)),
        };
        return buildPeak(sj_s, sj_res);
      });
      sj_parts.push(...this.vegetation(sj_range, sj_specs, sj_q.trees));
      const sj_material = createMountainMaterial({
        hazeDensity: sj_range.hazeDensity,
        hazeMin: sj_range.hazeMin,
        mist: new Vector2(...sj_range.mist),
        detail: sj_q.detail,
      });
      bySector(sj_parts).forEach((sj_group, sj_i) => {
        // centred on its own middle, so the renderer can sort it by distance (nearer
        // things are drawn first and hide what is behind them before it is shaded)
        const sj_geometry = merge(sj_group);
        const sj_centre = sj_geometry.boundingSphere!.center.clone();
        sj_geometry.translate(-sj_centre.x, -sj_centre.y, -sj_centre.z);
        const sj_mesh = new Mesh(sj_geometry, sj_material);
        sj_mesh.position.copy(sj_centre);
        sj_mesh.name = `mountains-${sj_range.name}-${sj_i}`;
        sj_mesh.matrixAutoUpdate = false;
        sj_mesh.updateMatrix();
        this.meshes.push(sj_mesh);
      });
    }
    // the wooded slopes below the rim, falling into the clouds
    const sj_skirt = new Mesh(
      merge([buildSkirt()]),
      createMountainMaterial({
        hazeDensity: 0.0016,
        hazeMin: 0,
        mist: new Vector2(10, 30),
        detail: sj_q.detail,
      }),
    );
    sj_skirt.name = 'mountains-skirt';
    sj_skirt.matrixAutoUpdate = false;
    this.meshes.push(sj_skirt);
    const sj_sea = createCloudSea(
      sj_CLOUD_SEA.height,
      sj_CLOUD_SEA.inner,
      sj_CLOUD_SEA.outer,
      sj_q.detail,
    );
    this.meshes.push(sj_sea);
    // farthest band first, so the nearer ones blend over it
    sj_MIST_BANDS
      .map((sj_b, sj_i) => createMistBand(sj_b, sj_i))
      .reverse()
      .forEach((sj_m, sj_i) => {
        sj_m.renderOrder = 2 + sj_i;
        this.meshes.push(sj_m);
      });
  }

  /** Scrub on the crowns, ledges and cliffs, and a few pines leaning out from the tops. */
  private vegetation(sj_range: RangeDef, sj_specs: PeakSpec[], sj_share: number): PeakMesh[] {
    const sj_rand = new Random(sj_range.seed + 99);
    const sj_out: PeakMesh[] = [];
    const { scrub: sj_scrub } = sj_range;
    sj_specs.forEach((sj_spec, sj_i) => {
      const sj_t = sj_TREES[sj_spec.kind];
      const sj_lush = sj_spec.kind === 'massif' ? 0.4 : sj_spec.kind === 'spire' ? 0.7 : 1;
      const sj_n = (sj_k: number) =>
        Math.round(sj_k * sj_lush * sj_share * (0.7 + 0.6 * sj_rand.float()));
      const sj_seed = () => sj_range.seed * 7919 + sj_i * 131 + sj_out.length;
      // spires only hold scrub on their ledges: a clump on the tip looks like a hat
      const sj_spire = sj_spec.kind === 'spire';
      const sj_clumps = [
        ...perches(sj_spec, sj_spire ? 0 : sj_n(sj_scrub.crown), sj_t.t[0], 1, 1),
        ...ledgesOf(sj_spec).flatMap((sj_at, sj_k) =>
          perches(sj_spec, sj_n(sj_scrub.ledge), sj_at, sj_at + 0.012, 2 + sj_k),
        ),
        ...perches(sj_spec, sj_spire ? 0 : sj_n(sj_scrub.cliff), 0.25, sj_t.t[0], 9),
      ];
      for (const sj_p of sj_clumps) {
        const sj_size =
          sj_rand.range(...sj_scrub.size) * (sj_p.t < sj_t.t[0] || sj_spire ? 0.7 : 1);
        sj_out.push(buildShrub(sj_p.x, sj_p.y, sj_p.z, sj_size, sj_p.ox, sj_p.oz, sj_seed()));
      }
      if (sj_range.trees > 0) {
        for (const sj_p of perches(
          sj_spec,
          sj_n(sj_range.trees * sj_t.share),
          sj_t.t[0] + 0.04,
          0.97,
          3,
        )) {
          const sj_size = sj_rand.range(...sj_range.treeSize);
          sj_out.push(
            sj_spec.kind === 'dome'
              ? buildConifer(sj_p.x, sj_p.y - 0.6, sj_p.z, sj_size, sj_seed())
              : buildPine(sj_p.x, sj_p.y, sj_p.z, sj_size, sj_p.ox, sj_p.oz, sj_t.reach, sj_seed()),
          );
        }
      }
    });
    return sj_out;
  }

  addTo(sj_scene: Scene): void {
    for (const sj_m of this.meshes) sj_scene.add(sj_m);
  }
}
