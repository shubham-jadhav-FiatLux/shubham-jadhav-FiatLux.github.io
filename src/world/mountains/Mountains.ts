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
const WIDTH: Record<PeakKind, [number, number]> = {
  karst: [0.15, 0.27],
  spire: [0.11, 0.18],
  massif: [0.75, 1.05],
  dome: [1.1, 1.7],
};

/** Where trees grow on each kind of peak (height fractions) and how far they lean out. */
const TREES: Record<PeakKind, { t: [number, number]; share: number; reach: number }> = {
  karst: { t: [0.78, 0.985], share: 1, reach: 0.6 },
  spire: { t: [0.72, 0.97], share: 0, reach: 0.9 },
  massif: { t: [0.55, 0.85], share: 0.3, reach: 0.3 },
  dome: { t: [0.35, 0.95], share: 1, reach: 0 },
};

/**
 * The ranges around the valley, nearest first: the karst towers, then ever paler and
 * higher ranges into the distance.
 */
export const RANGES: RangeDef[] = [
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
export const MIST_BANDS: MistBand[] = [
  { radius: 176, y0: 26, y1: 70, alpha: 0.72 },
  { radius: 300, y0: 34, y1: 120, alpha: 0.68 },
  { radius: 560, y0: 50, y1: 178, alpha: 0.64 },
  { radius: 1000, y0: 70, y1: 262, alpha: 0.6 },
];

/** The sea of cloud below the rim. */
export const CLOUD_SEA = { height: 27, inner: 118, outer: 2300 };

const QUALITY: Record<QualityLevel, { res: number; trees: number; detail: boolean }> = {
  low: { res: 0.6, trees: 0.45, detail: false },
  medium: { res: 0.8, trees: 0.75, detail: true },
  high: { res: 1, trees: 1, detail: true },
};

const shapeNoise = new SimplexNoise(5150);

function pick<K extends string>(rand: Random, weights: Partial<Record<K, number>>): K {
  const entries = Object.entries(weights) as [K, number][];
  let total = 0;
  for (const [, w] of entries) total += w;
  let r = rand.float() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1]![0];
}

/** The peaks of one range (pure data; deterministic for a given definition). */
export function planRange(range: RangeDef): PeakSpec[] {
  const rand = new Random(range.seed);
  const specs: PeakSpec[] = [];
  for (let i = 0; i < range.clusters; i++) {
    const a = ((i + rand.range(-0.3, 0.3)) / range.clusters) * Math.PI * 2;
    if (rand.chance(range.gaps)) continue;
    const r = lerp(range.inner, range.outer, rand.range(0.15, 0.85));
    // Heights rise and fall around the circle in long swells, so the skyline has
    // groups of high peaks and quieter stretches rather than even teeth.
    const swell =
      0.5 + 0.5 * shapeNoise.noise2(Math.cos(a) * 1.6 + range.seed, Math.sin(a) * 1.6 - range.seed);
    const k = Math.min(1, Math.max(0, swell * 0.75 + rand.float() * 0.35));
    const kind = pick(rand, range.kinds);
    const height = lerp(range.heights[0], range.heights[1], k);
    const main: PeakSpec = {
      kind,
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      base: range.base,
      height: height - range.base,
      radius: Math.min(r - range.keepOut, (height - range.base) * rand.range(...WIDTH[kind])),
      lean: kind === 'karst' || kind === 'spire' ? rand.range(0, 0.1) : 0,
      leanAngle: rand.range(0, Math.PI * 2),
      seed: range.seed * 1000 + i * 10,
    };
    specs.push(main);
    const satellites = rand.int(range.satellites[0], range.satellites[1]);
    for (let s = 0; s < satellites; s++) {
      const sk: PeakKind = kind === 'dome' ? 'dome' : rand.chance(0.6) ? kind : 'spire';
      const h = main.height * rand.range(0.42, 0.78);
      const ang = rand.range(0, Math.PI * 2);
      const off = main.radius * rand.range(0.55, 1.05);
      const sx = main.x + Math.cos(ang) * off;
      const sz = main.z + Math.sin(ang) * off;
      const room = Math.hypot(sx, sz) - range.keepOut;
      if (room < 6) continue;
      specs.push({
        kind: sk,
        x: sx,
        z: sz,
        base: range.base,
        height: h,
        radius: Math.min(room, h * rand.range(...WIDTH[sk])),
        lean: sk === 'karst' || sk === 'spire' ? rand.range(0, 0.12) : 0,
        leanAngle: rand.range(0, Math.PI * 2),
        seed: main.seed + s + 1,
      });
    }
  }
  return specs;
}

/** Concatenates meshes into one geometry with smooth normals. */
function merge(parts: PeakMesh[]): BufferGeometry {
  let vertices = 0;
  let indices = 0;
  for (const p of parts) {
    vertices += p.positions.length / 3;
    indices += p.indices.length;
  }
  const positions = new Float32Array(vertices * 3);
  const info = new Float32Array(vertices * 3);
  const index = new Uint32Array(indices);
  let v = 0;
  let o = 0;
  for (const p of parts) {
    positions.set(p.positions, v * 3);
    info.set(p.info, v * 3);
    for (let i = 0; i < p.indices.length; i++) index[o + i] = p.indices[i]! + v;
    v += p.positions.length / 3;
    o += p.indices.length;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(positions, 3));
  geo.setAttribute('aInfo', new BufferAttribute(info, 3));
  geo.setIndex(new BufferAttribute(index, 1));
  geo.computeVertexNormals();
  // parts that bring their own shading normals keep them
  const normal = geo.getAttribute('normal') as BufferAttribute;
  v = 0;
  for (const p of parts) {
    if (p.normals) (normal.array as Float32Array).set(p.normals, v * 3);
    v += p.positions.length / 3;
  }
  geo.computeBoundingSphere();
  return geo;
}

/**
 * The mountains around the valley: layered ranges of karst towers and peaks that grow
 * paler with distance, each rising out of its own band of mist above a sea of cloud.
 */
export class Mountains {
  readonly meshes: Mesh[] = [];

  constructor(level: QualityLevel) {
    const q = QUALITY[level];
    for (const range of RANGES) {
      const specs = planRange(range);
      const tallest = Math.max(...specs.map((s) => s.height));
      const parts: PeakMesh[] = specs.map((s) => {
        // smaller peaks get fewer vertices
        const k = q.res * Math.max(0.6, Math.sqrt(s.height / tallest));
        const res: Resolution = {
          around: Math.max(12, Math.round(range.res.around * k)),
          rings: Math.max(8, Math.round(range.res.rings * k)),
        };
        return buildPeak(s, res);
      });
      parts.push(...this.vegetation(range, specs, q.trees));
      const mesh = new Mesh(
        merge(parts),
        createMountainMaterial({
          hazeDensity: range.hazeDensity,
          hazeMin: range.hazeMin,
          mist: new Vector2(...range.mist),
          detail: q.detail,
        }),
      );
      mesh.name = `mountains-${range.name}`;
      mesh.matrixAutoUpdate = false;
      this.meshes.push(mesh);
    }
    // the wooded slopes below the rim, falling into the clouds
    const skirt = new Mesh(
      merge([buildSkirt()]),
      createMountainMaterial({
        hazeDensity: 0.0016,
        hazeMin: 0,
        mist: new Vector2(10, 30),
        detail: q.detail,
      }),
    );
    skirt.name = 'mountains-skirt';
    skirt.matrixAutoUpdate = false;
    this.meshes.push(skirt);
    const sea = createCloudSea(CLOUD_SEA.height, CLOUD_SEA.inner, CLOUD_SEA.outer, q.detail);
    this.meshes.push(sea);
    // farthest band first, so the nearer ones blend over it
    MIST_BANDS.map((b, i) => createMistBand(b, i))
      .reverse()
      .forEach((m, i) => {
        m.renderOrder = 2 + i;
        this.meshes.push(m);
      });
  }

  /** Scrub on the crowns, ledges and cliffs, and a few pines leaning out from the tops. */
  private vegetation(range: RangeDef, specs: PeakSpec[], share: number): PeakMesh[] {
    const rand = new Random(range.seed + 99);
    const out: PeakMesh[] = [];
    const { scrub } = range;
    specs.forEach((spec, i) => {
      const t = TREES[spec.kind];
      const lush = spec.kind === 'massif' ? 0.4 : spec.kind === 'spire' ? 0.7 : 1;
      const n = (k: number) => Math.round(k * lush * share * (0.7 + 0.6 * rand.float()));
      const seed = () => range.seed * 7919 + i * 131 + out.length;
      // spires only hold scrub on their ledges: a clump on the tip looks like a hat
      const spire = spec.kind === 'spire';
      const clumps = [
        ...perches(spec, spire ? 0 : n(scrub.crown), t.t[0], 1, 1),
        ...ledgesOf(spec).flatMap((at, k) => perches(spec, n(scrub.ledge), at, at + 0.012, 2 + k)),
        ...perches(spec, spire ? 0 : n(scrub.cliff), 0.25, t.t[0], 9),
      ];
      for (const p of clumps) {
        const size = rand.range(...scrub.size) * (p.t < t.t[0] || spire ? 0.7 : 1);
        out.push(buildShrub(p.x, p.y, p.z, size, p.ox, p.oz, seed()));
      }
      if (range.trees > 0) {
        for (const p of perches(spec, n(range.trees * t.share), t.t[0] + 0.04, 0.97, 3)) {
          const size = rand.range(...range.treeSize);
          out.push(
            spec.kind === 'dome'
              ? buildConifer(p.x, p.y - 0.6, p.z, size, seed())
              : buildPine(p.x, p.y, p.z, size, p.ox, p.oz, t.reach, seed()),
          );
        }
      }
    });
    return out;
  }

  addTo(scene: Scene): void {
    for (const m of this.meshes) scene.add(m);
  }
}
