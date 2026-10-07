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

const sj_SPECS: Record<RockStyle, StyleSpec> = {
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

const sj_MOSS_A = new Color('#56703a');
const sj_MOSS_B = new Color('#7d8f45');
const sj_v = new Vector3();

/**
 * A chiselled rock: a sphere pushed onto a set of random cutting planes (a convex hull
 * with softly bevelled edges), then roughened with noise, grooves and strata. Vertex
 * colours carry per-facet tone, crevice and ground-contact darkening and moss on the
 * upward faces; the rock material adds pixel-level grain, lichen and bump on top.
 */
export function createRock(sj_seed: number, sj_style: RockStyle): BufferGeometry {
  const sj_spec = sj_SPECS[sj_style];
  const sj_rand = new Random(sj_seed);
  const sj_noise = new SimplexNoise(sj_seed * 7 + 3);

  // Cutting planes.
  const sj_normals: Vector3[] = [];
  const sj_dists: number[] = [];
  const sj_tones: number[] = [];
  for (let sj_i = 0; sj_i < sj_spec.planes; sj_i++) {
    let sj_n: Vector3;
    if (sj_rand.chance(sj_spec.vertical)) {
      const sj_a = sj_rand.range(0, Math.PI * 2);
      sj_n = new Vector3(Math.cos(sj_a), sj_rand.spread(0.28), Math.sin(sj_a));
    } else {
      // uniform direction, biased upwards (the bottom is buried anyway)
      const sj_y = sj_rand.range(-0.35, 1);
      const sj_a = sj_rand.range(0, Math.PI * 2);
      const sj_r = Math.sqrt(1 - sj_y * sj_y);
      sj_n = new Vector3(Math.cos(sj_a) * sj_r, sj_y, Math.sin(sj_a) * sj_r);
    }
    sj_normals.push(sj_n.normalize());
    sj_dists.push(sj_rand.range(sj_spec.cut[0], sj_spec.cut[1]));
    sj_tones.push(sj_rand.range(-1, 1));
  }
  if (sj_spec.flatTop) {
    sj_normals.push(new Vector3(sj_rand.spread(0.18), 1, sj_rand.spread(0.18)).normalize());
    sj_dists.push(sj_rand.range(0.72, 0.84));
    sj_tones.push(sj_rand.range(-1, 1));
  }

  let sj_geo: BufferGeometry = new IcosahedronGeometry(1, 4);
  sj_geo.deleteAttribute('uv');
  sj_geo.deleteAttribute('normal');
  sj_geo = mergeVertices(sj_geo);
  const sj_pos = sj_geo.attributes.position as BufferAttribute;
  const sj_count = sj_pos.count;
  const [sj_sx, sj_sy, sj_sz] = sj_spec.stretch;
  const sj_facet = new Int16Array(sj_count);
  const sj_concave = new Float32Array(sj_count);
  const sj_k = sj_spec.bevel;

  for (let sj_i = 0; sj_i < sj_count; sj_i++) {
    sj_v.fromBufferAttribute(sj_pos, sj_i).normalize();
    // Soft-min over the plane distances along this direction: flat facets, round edges.
    let sj_hard = 1.12;
    let sj_best = -1;
    let sj_sum = Math.exp(-1.12 / sj_k);
    for (let sj_p = 0; sj_p < sj_normals.length; sj_p++) {
      const sj_c = sj_v.dot(sj_normals[sj_p]!);
      if (sj_c < 0.02) continue;
      const sj_t = Math.min(3, sj_dists[sj_p]! / sj_c);
      sj_sum += Math.exp(-sj_t / sj_k);
      if (sj_t < sj_hard) {
        sj_hard = sj_t;
        sj_best = sj_p;
      }
    }
    let sj_r = -sj_k * Math.log(sj_sum);
    // Large irregularity and fine roughness.
    sj_r *= 1 + sj_noise.fbm3(sj_v.x * 1.4, sj_v.y * 1.4, sj_v.z * 1.4, 3) * 0.07;
    sj_r *= 1 + sj_noise.noise3(sj_v.x * 6.5, sj_v.y * 6.5, sj_v.z * 6.5) * 0.012;
    // Weathered grooves (thin ridged-noise valleys).
    const sj_ridge = 1 - Math.abs(sj_noise.noise3(sj_v.x * 2.1 + 9, sj_v.y * 2.1, sj_v.z * 2.1));
    const sj_groove = smoothstep(0.9, 1, sj_ridge);
    sj_r -= sj_groove * 0.035;
    // Sedimentary layers.
    if (sj_spec.strata > 0) {
      sj_r *=
        1 +
        sj_spec.strata *
          0.014 *
          Math.sin(sj_v.y * sj_sy * 13 + sj_noise.noise3(sj_v.x, sj_v.y, sj_v.z) * 2);
    }
    sj_facet[sj_i] = sj_best;
    sj_concave[sj_i] = Math.max(0, sj_hard - sj_r) + sj_groove * 0.4;
    let sj_x = sj_v.x * sj_r * sj_sx;
    let sj_y = sj_v.y * sj_r * sj_sy;
    let sj_z = sj_v.z * sj_r * sj_sz;
    // Flatten the underside so the rock sits (the part below ground is hidden).
    const sj_floor = -0.32 * sj_sy;
    if (sj_y < sj_floor) sj_y = sj_floor + (sj_y - sj_floor) * 0.2;
    if (sj_style === 'tall') {
      // eroded scholar-rock holes and waists
      const sj_w =
        1 -
        0.12 *
          Math.max(0, Math.sin(sj_v.y * 5 + sj_noise.noise3(sj_v.x * 2, sj_v.y, sj_v.z * 2) * 3));
      sj_x *= sj_w;
      sj_z *= sj_w;
    }
    sj_pos.setXYZ(sj_i, sj_x, sj_y, sj_z);
  }
  sj_geo.computeVertexNormals();

  const sj_nrm = sj_geo.attributes.normal as BufferAttribute;
  const sj_colors = new Float32Array(sj_count * 3);
  const sj_base = new Color(sj_spec.color);
  const sj_warm = new Color('#9a8468');
  const sj_cool = new Color('#7c8286');
  const sj_c = new Color();
  const sj_moss = new Color();
  for (let sj_i = 0; sj_i < sj_count; sj_i++) {
    const sj_tone = sj_facet[sj_i]! >= 0 ? sj_tones[sj_facet[sj_i]!]! : 0;
    sj_c.copy(sj_base).lerp(sj_tone > 0 ? sj_warm : sj_cool, Math.abs(sj_tone) * 0.35);
    sj_c.multiplyScalar(0.92 + sj_tone * 0.07);
    // crevices and grooves
    sj_c.multiplyScalar(1 - Math.min(0.5, sj_concave[sj_i]! * 5.5));
    // darker where it meets the ground
    const sj_y = sj_pos.getY(sj_i) / sj_sy;
    sj_c.multiplyScalar(0.7 + 0.3 * smoothstep(-0.32, 0.15, sj_y));
    // moss on upward faces, patchy
    const sj_ny = sj_nrm.getY(sj_i);
    const sj_patch = sj_noise.noise3(
      sj_pos.getX(sj_i) * 0.9,
      sj_pos.getY(sj_i) * 0.9,
      sj_pos.getZ(sj_i) * 0.9,
    );
    const sj_amount =
      smoothstep(0.45, 0.86, sj_ny) * smoothstep(-0.55, 0.15, sj_patch) * sj_spec.moss;
    if (sj_amount > 0) {
      sj_moss.copy(sj_MOSS_A).lerp(sj_MOSS_B, 0.5 + 0.5 * sj_patch);
      sj_c.lerp(sj_moss, Math.min(0.92, sj_amount));
    }
    sj_colors.set([sj_c.r, sj_c.g, sj_c.b], sj_i * 3);
  }
  sj_geo.setAttribute('color', new BufferAttribute(sj_colors, 3));
  return sj_geo;
}
