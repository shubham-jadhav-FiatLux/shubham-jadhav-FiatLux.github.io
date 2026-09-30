import { BufferAttribute, Color, IcosahedronGeometry, Vector3, type BufferGeometry } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimplexNoise } from '../../utils/noise';
import { Random } from '../../utils/random';
import { smoothstep } from '../../utils/math';

export type RockStyle = 'boulder' | 'flat' | 'tall' | 'cliff';

interface StyleSpec {
  /** non-uniform scale applied after shaping */
  stretch: [number, number, number];
  /** number of cutting planes */
  planes: number;
  /** distance range of the planes from the centre (smaller = deeper cuts) */
  cut: [number, number];
  /** roundness of facet edges (soft-min width) */
  bevel: number;
  /** share of planes that make near-vertical faces (blocky rocks) */
  vertical: number;
  /** add a nearly flat top face */
  flatTop: boolean;
  color: string;
  /** how much moss grows on the upward faces */
  moss: number;
  /** horizontal sedimentary layering */
  strata: number;
}

const SPECS: Record<RockStyle, StyleSpec> = {
  boulder: {
    stretch: [1.08, 0.84, 1],
    planes: 11,
    cut: [0.72, 0.92],
    bevel: 0.055,
    vertical: 0.35,
    flatTop: false,
    color: '#8d867a',
    moss: 1,
    strata: 0.25,
  },
  flat: {
    stretch: [1.32, 0.52, 1.1],
    planes: 9,
    cut: [0.76, 0.94],
    bevel: 0.06,
    vertical: 0.25,
    flatTop: true,
    color: '#948c7f',
    moss: 0.8,
    strata: 0.6,
  },
  tall: {
    stretch: [0.62, 1.72, 0.54],
    planes: 12,
    cut: [0.7, 0.9],
    bevel: 0.045,
    vertical: 0.55,
    flatTop: false,
    color: '#7e7d77',
    moss: 0.45,
    strata: 0,
  },
  cliff: {
    stretch: [1.25, 1.05, 1],
    planes: 10,
    cut: [0.68, 0.9],
    bevel: 0.035,
    vertical: 0.75,
    flatTop: true,
    color: '#898073',
    moss: 1.25,
    strata: 1,
  },
};

const MOSS_A = new Color('#56703a');
const MOSS_B = new Color('#7d8f45');
const v = new Vector3();

/**
 * A chiselled rock: a sphere pushed onto a set of random cutting planes (a convex hull
 * with softly bevelled edges), then roughened with noise, grooves and strata. Vertex
 * colours carry per-facet tone, crevice and ground-contact darkening and moss on the
 * upward faces; the rock material adds pixel-level grain, lichen and bump on top.
 */
export function createRock(seed: number, style: RockStyle): BufferGeometry {
  const spec = SPECS[style];
  const rand = new Random(seed);
  const noise = new SimplexNoise(seed * 7 + 3);

  // Cutting planes.
  const normals: Vector3[] = [];
  const dists: number[] = [];
  const tones: number[] = [];
  for (let i = 0; i < spec.planes; i++) {
    let n: Vector3;
    if (rand.chance(spec.vertical)) {
      const a = rand.range(0, Math.PI * 2);
      n = new Vector3(Math.cos(a), rand.spread(0.28), Math.sin(a));
    } else {
      // uniform direction, biased upwards (the bottom is buried anyway)
      const y = rand.range(-0.35, 1);
      const a = rand.range(0, Math.PI * 2);
      const r = Math.sqrt(1 - y * y);
      n = new Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    }
    normals.push(n.normalize());
    dists.push(rand.range(spec.cut[0], spec.cut[1]));
    tones.push(rand.range(-1, 1));
  }
  if (spec.flatTop) {
    normals.push(new Vector3(rand.spread(0.18), 1, rand.spread(0.18)).normalize());
    dists.push(rand.range(0.72, 0.84));
    tones.push(rand.range(-1, 1));
  }

  let geo: BufferGeometry = new IcosahedronGeometry(1, 4);
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo);
  const pos = geo.attributes.position as BufferAttribute;
  const count = pos.count;
  const [sx, sy, sz] = spec.stretch;
  const facet = new Int16Array(count);
  const concave = new Float32Array(count);
  const k = spec.bevel;

  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    // Soft-min over the plane distances along this direction: flat facets, round edges.
    let hard = 1.12;
    let best = -1;
    let sum = Math.exp(-1.12 / k);
    for (let p = 0; p < normals.length; p++) {
      const c = v.dot(normals[p]!);
      if (c < 0.02) continue;
      const t = Math.min(3, dists[p]! / c);
      sum += Math.exp(-t / k);
      if (t < hard) {
        hard = t;
        best = p;
      }
    }
    let r = -k * Math.log(sum);
    // Large irregularity and fine roughness.
    r *= 1 + noise.fbm3(v.x * 1.4, v.y * 1.4, v.z * 1.4, 3) * 0.07;
    r *= 1 + noise.noise3(v.x * 6.5, v.y * 6.5, v.z * 6.5) * 0.012;
    // Weathered grooves (thin ridged-noise valleys).
    const ridge = 1 - Math.abs(noise.noise3(v.x * 2.1 + 9, v.y * 2.1, v.z * 2.1));
    const groove = smoothstep(0.9, 1, ridge);
    r -= groove * 0.035;
    // Sedimentary layers.
    if (spec.strata > 0) {
      r *= 1 + spec.strata * 0.014 * Math.sin(v.y * sy * 13 + noise.noise3(v.x, v.y, v.z) * 2);
    }
    facet[i] = best;
    concave[i] = Math.max(0, hard - r) + groove * 0.4;
    let x = v.x * r * sx;
    let y = v.y * r * sy;
    let z = v.z * r * sz;
    // Flatten the underside so the rock sits (the part below ground is hidden).
    const floor = -0.32 * sy;
    if (y < floor) y = floor + (y - floor) * 0.2;
    if (style === 'tall') {
      // eroded scholar-rock holes and waists
      const w = 1 - 0.12 * Math.max(0, Math.sin(v.y * 5 + noise.noise3(v.x * 2, v.y, v.z * 2) * 3));
      x *= w;
      z *= w;
    }
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();

  const nrm = geo.attributes.normal as BufferAttribute;
  const colors = new Float32Array(count * 3);
  const base = new Color(spec.color);
  const warm = new Color('#9a8468');
  const cool = new Color('#7c8286');
  const c = new Color();
  const moss = new Color();
  for (let i = 0; i < count; i++) {
    const tone = facet[i]! >= 0 ? tones[facet[i]!]! : 0;
    c.copy(base).lerp(tone > 0 ? warm : cool, Math.abs(tone) * 0.35);
    c.multiplyScalar(0.92 + tone * 0.07);
    // crevices and grooves
    c.multiplyScalar(1 - Math.min(0.5, concave[i]! * 5.5));
    // darker where it meets the ground
    const y = pos.getY(i) / sy;
    c.multiplyScalar(0.7 + 0.3 * smoothstep(-0.32, 0.15, y));
    // moss on upward faces, patchy
    const ny = nrm.getY(i);
    const patch = noise.noise3(pos.getX(i) * 0.9, pos.getY(i) * 0.9, pos.getZ(i) * 0.9);
    const amount = smoothstep(0.45, 0.86, ny) * smoothstep(-0.55, 0.15, patch) * spec.moss;
    if (amount > 0) {
      moss.copy(MOSS_A).lerp(MOSS_B, 0.5 + 0.5 * patch);
      c.lerp(moss, Math.min(0.92, amount));
    }
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  return geo;
}
