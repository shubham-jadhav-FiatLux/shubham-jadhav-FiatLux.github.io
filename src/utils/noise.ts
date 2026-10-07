/**
 * Seeded simplex noise (2D and 3D) and fractal helpers.
 * Based on Stefan Gustavson's public domain reference implementation.
 */
import { mulberry32 } from './random';

const sj_F2 = 0.5 * (Math.sqrt(3) - 1);
const sj_G2 = (3 - Math.sqrt(3)) / 6;
const sj_F3 = 1 / 3;
const sj_G3 = 1 / 6;

const sj_GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1,
  0, 1, -1, 0, -1, -1,
]);

export class SimplexNoise {
  private perm = new Uint8Array(512);
  private permMod12 = new Uint8Array(512);

  constructor(sj_seed = 1) {
    const sj_rand = mulberry32(sj_seed);
    const sj_p = new Uint8Array(256);
    for (let sj_i = 0; sj_i < 256; sj_i++) sj_p[sj_i] = sj_i;
    for (let sj_i = 255; sj_i > 0; sj_i--) {
      const sj_j = Math.floor(sj_rand() * (sj_i + 1));
      const sj_tmp = sj_p[sj_i]!;
      sj_p[sj_i] = sj_p[sj_j]!;
      sj_p[sj_j] = sj_tmp;
    }
    for (let sj_i = 0; sj_i < 512; sj_i++) {
      this.perm[sj_i] = sj_p[sj_i & 255]!;
      this.permMod12[sj_i] = this.perm[sj_i]! % 12;
    }
  }

  /** 2D simplex noise in roughly [-1, 1]. */
  noise2(sj_xin: number, sj_yin: number): number {
    const sj_perm = this.perm;
    const sj_pm = this.permMod12;
    let sj_n0 = 0;
    let sj_n1 = 0;
    let sj_n2 = 0;
    const sj_s = (sj_xin + sj_yin) * sj_F2;
    const sj_i = Math.floor(sj_xin + sj_s);
    const sj_j = Math.floor(sj_yin + sj_s);
    const sj_t = (sj_i + sj_j) * sj_G2;
    const sj_x0 = sj_xin - (sj_i - sj_t);
    const sj_y0 = sj_yin - (sj_j - sj_t);
    const sj_i1 = sj_x0 > sj_y0 ? 1 : 0;
    const sj_j1 = sj_x0 > sj_y0 ? 0 : 1;
    const sj_x1 = sj_x0 - sj_i1 + sj_G2;
    const sj_y1 = sj_y0 - sj_j1 + sj_G2;
    const sj_x2 = sj_x0 - 1 + 2 * sj_G2;
    const sj_y2 = sj_y0 - 1 + 2 * sj_G2;
    const sj_ii = sj_i & 255;
    const sj_jj = sj_j & 255;
    let sj_t0 = 0.5 - sj_x0 * sj_x0 - sj_y0 * sj_y0;
    if (sj_t0 >= 0) {
      const sj_gi = sj_pm[sj_ii + sj_perm[sj_jj]!]! * 3;
      sj_t0 *= sj_t0;
      sj_n0 = sj_t0 * sj_t0 * (sj_GRAD3[sj_gi]! * sj_x0 + sj_GRAD3[sj_gi + 1]! * sj_y0);
    }
    let sj_t1 = 0.5 - sj_x1 * sj_x1 - sj_y1 * sj_y1;
    if (sj_t1 >= 0) {
      const sj_gi = sj_pm[sj_ii + sj_i1 + sj_perm[sj_jj + sj_j1]!]! * 3;
      sj_t1 *= sj_t1;
      sj_n1 = sj_t1 * sj_t1 * (sj_GRAD3[sj_gi]! * sj_x1 + sj_GRAD3[sj_gi + 1]! * sj_y1);
    }
    let sj_t2 = 0.5 - sj_x2 * sj_x2 - sj_y2 * sj_y2;
    if (sj_t2 >= 0) {
      const sj_gi = sj_pm[sj_ii + 1 + sj_perm[sj_jj + 1]!]! * 3;
      sj_t2 *= sj_t2;
      sj_n2 = sj_t2 * sj_t2 * (sj_GRAD3[sj_gi]! * sj_x2 + sj_GRAD3[sj_gi + 1]! * sj_y2);
    }
    return 70 * (sj_n0 + sj_n1 + sj_n2);
  }

  /** 3D simplex noise in roughly [-1, 1]. */
  noise3(sj_xin: number, sj_yin: number, sj_zin: number): number {
    const sj_perm = this.perm;
    const sj_pm = this.permMod12;
    let sj_n0 = 0;
    let sj_n1 = 0;
    let sj_n2 = 0;
    let sj_n3 = 0;
    const sj_s = (sj_xin + sj_yin + sj_zin) * sj_F3;
    const sj_i = Math.floor(sj_xin + sj_s);
    const sj_j = Math.floor(sj_yin + sj_s);
    const sj_k = Math.floor(sj_zin + sj_s);
    const sj_t = (sj_i + sj_j + sj_k) * sj_G3;
    const sj_x0 = sj_xin - (sj_i - sj_t);
    const sj_y0 = sj_yin - (sj_j - sj_t);
    const sj_z0 = sj_zin - (sj_k - sj_t);
    let sj_i1: number, sj_j1: number, sj_k1: number, sj_i2: number, sj_j2: number, sj_k2: number;
    if (sj_x0 >= sj_y0) {
      if (sj_y0 >= sj_z0) {
        sj_i1 = 1;
        sj_j1 = 0;
        sj_k1 = 0;
        sj_i2 = 1;
        sj_j2 = 1;
        sj_k2 = 0; // prettier-ignore
      } else if (sj_x0 >= sj_z0) {
        sj_i1 = 1;
        sj_j1 = 0;
        sj_k1 = 0;
        sj_i2 = 1;
        sj_j2 = 0;
        sj_k2 = 1; // prettier-ignore
      } else {
        sj_i1 = 0;
        sj_j1 = 0;
        sj_k1 = 1;
        sj_i2 = 1;
        sj_j2 = 0;
        sj_k2 = 1; // prettier-ignore
      }
    } else {
      if (sj_y0 < sj_z0) {
        sj_i1 = 0;
        sj_j1 = 0;
        sj_k1 = 1;
        sj_i2 = 0;
        sj_j2 = 1;
        sj_k2 = 1; // prettier-ignore
      } else if (sj_x0 < sj_z0) {
        sj_i1 = 0;
        sj_j1 = 1;
        sj_k1 = 0;
        sj_i2 = 0;
        sj_j2 = 1;
        sj_k2 = 1; // prettier-ignore
      } else {
        sj_i1 = 0;
        sj_j1 = 1;
        sj_k1 = 0;
        sj_i2 = 1;
        sj_j2 = 1;
        sj_k2 = 0; // prettier-ignore
      }
    }
    const sj_x1 = sj_x0 - sj_i1 + sj_G3;
    const sj_y1 = sj_y0 - sj_j1 + sj_G3;
    const sj_z1 = sj_z0 - sj_k1 + sj_G3;
    const sj_x2 = sj_x0 - sj_i2 + 2 * sj_G3;
    const sj_y2 = sj_y0 - sj_j2 + 2 * sj_G3;
    const sj_z2 = sj_z0 - sj_k2 + 2 * sj_G3;
    const sj_x3 = sj_x0 - 1 + 3 * sj_G3;
    const sj_y3 = sj_y0 - 1 + 3 * sj_G3;
    const sj_z3 = sj_z0 - 1 + 3 * sj_G3;
    const sj_ii = sj_i & 255;
    const sj_jj = sj_j & 255;
    const sj_kk = sj_k & 255;
    let sj_t0 = 0.6 - sj_x0 * sj_x0 - sj_y0 * sj_y0 - sj_z0 * sj_z0;
    if (sj_t0 >= 0) {
      const sj_gi = sj_pm[sj_ii + sj_perm[sj_jj + sj_perm[sj_kk]!]!]! * 3;
      sj_t0 *= sj_t0;
      sj_n0 =
        sj_t0 *
        sj_t0 *
        (sj_GRAD3[sj_gi]! * sj_x0 + sj_GRAD3[sj_gi + 1]! * sj_y0 + sj_GRAD3[sj_gi + 2]! * sj_z0);
    }
    let sj_t1 = 0.6 - sj_x1 * sj_x1 - sj_y1 * sj_y1 - sj_z1 * sj_z1;
    if (sj_t1 >= 0) {
      const sj_gi = sj_pm[sj_ii + sj_i1 + sj_perm[sj_jj + sj_j1 + sj_perm[sj_kk + sj_k1]!]!]! * 3;
      sj_t1 *= sj_t1;
      sj_n1 =
        sj_t1 *
        sj_t1 *
        (sj_GRAD3[sj_gi]! * sj_x1 + sj_GRAD3[sj_gi + 1]! * sj_y1 + sj_GRAD3[sj_gi + 2]! * sj_z1);
    }
    let sj_t2 = 0.6 - sj_x2 * sj_x2 - sj_y2 * sj_y2 - sj_z2 * sj_z2;
    if (sj_t2 >= 0) {
      const sj_gi = sj_pm[sj_ii + sj_i2 + sj_perm[sj_jj + sj_j2 + sj_perm[sj_kk + sj_k2]!]!]! * 3;
      sj_t2 *= sj_t2;
      sj_n2 =
        sj_t2 *
        sj_t2 *
        (sj_GRAD3[sj_gi]! * sj_x2 + sj_GRAD3[sj_gi + 1]! * sj_y2 + sj_GRAD3[sj_gi + 2]! * sj_z2);
    }
    let sj_t3 = 0.6 - sj_x3 * sj_x3 - sj_y3 * sj_y3 - sj_z3 * sj_z3;
    if (sj_t3 >= 0) {
      const sj_gi = sj_pm[sj_ii + 1 + sj_perm[sj_jj + 1 + sj_perm[sj_kk + 1]!]!]! * 3;
      sj_t3 *= sj_t3;
      sj_n3 =
        sj_t3 *
        sj_t3 *
        (sj_GRAD3[sj_gi]! * sj_x3 + sj_GRAD3[sj_gi + 1]! * sj_y3 + sj_GRAD3[sj_gi + 2]! * sj_z3);
    }
    return 32 * (sj_n0 + sj_n1 + sj_n2 + sj_n3);
  }

  /** Fractal Brownian motion over 2D simplex noise, normalised to roughly [-1, 1]. */
  fbm2(sj_x: number, sj_y: number, sj_octaves = 4, sj_lacunarity = 2, sj_gain = 0.5): number {
    let sj_sum = 0;
    let sj_amp = 1;
    let sj_freq = 1;
    let sj_norm = 0;
    for (let sj_o = 0; sj_o < sj_octaves; sj_o++) {
      sj_sum += sj_amp * this.noise2(sj_x * sj_freq, sj_y * sj_freq);
      sj_norm += sj_amp;
      sj_amp *= sj_gain;
      sj_freq *= sj_lacunarity;
    }
    return sj_sum / sj_norm;
  }

  /** Ridged multifractal: sharp crests, useful for rocky hills. Range roughly [0, 1]. */
  ridged2(sj_x: number, sj_y: number, sj_octaves = 4): number {
    let sj_sum = 0;
    let sj_amp = 0.5;
    let sj_freq = 1;
    let sj_norm = 0;
    for (let sj_o = 0; sj_o < sj_octaves; sj_o++) {
      const sj_n = 1 - Math.abs(this.noise2(sj_x * sj_freq, sj_y * sj_freq));
      sj_sum += sj_n * sj_n * sj_amp;
      sj_norm += sj_amp;
      sj_amp *= 0.5;
      sj_freq *= 2;
    }
    return sj_sum / sj_norm;
  }

  fbm3(sj_x: number, sj_y: number, sj_z: number, sj_octaves = 3): number {
    let sj_sum = 0;
    let sj_amp = 1;
    let sj_freq = 1;
    let sj_norm = 0;
    for (let sj_o = 0; sj_o < sj_octaves; sj_o++) {
      sj_sum += sj_amp * this.noise3(sj_x * sj_freq, sj_y * sj_freq, sj_z * sj_freq);
      sj_norm += sj_amp;
      sj_amp *= 0.5;
      sj_freq *= 2;
    }
    return sj_sum / sj_norm;
  }
}
