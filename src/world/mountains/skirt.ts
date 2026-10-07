import { sj_CELL, terrainHeight } from '../heightfield';
import { sj_TERRAIN_ORIGIN, sj_TERRAIN_RES } from '../layout';
import { SimplexNoise } from '../../utils/noise';
import type { PeakMesh } from './peaks';

/** Rows of the skirt: how far out from the edge of the terrain and how far down (m). */
const sj_ROWS = [
  { out: 0, down: 0 },
  { out: 6, down: 3 },
  { out: 16, down: 11 },
  { out: 30, down: 26 },
  { out: 52, down: 50 },
];

const sj_noise = new SimplexNoise(8821);

/**
 * Wooded slopes falling away from the edge of the terrain into the sea of cloud, so the
 * edge of the world never shows from the air. The top row is exactly the terrain's own
 * border, so there is no seam.
 */
export function buildSkirt(): PeakMesh {
  const sj_n = sj_TERRAIN_RES;
  const sj_border: [number, number][] = [];
  const sj_at = (sj_i: number, sj_j: number): [number, number] => [
    sj_TERRAIN_ORIGIN + sj_i * sj_CELL,
    sj_TERRAIN_ORIGIN + sj_j * sj_CELL,
  ];
  for (let sj_i = 0; sj_i < sj_n - 1; sj_i++) sj_border.push(sj_at(sj_i, 0));
  for (let sj_j = 0; sj_j < sj_n - 1; sj_j++) sj_border.push(sj_at(sj_n - 1, sj_j));
  for (let sj_i = sj_n - 1; sj_i > 0; sj_i--) sj_border.push(sj_at(sj_i, sj_n - 1));
  for (let sj_j = sj_n - 1; sj_j > 0; sj_j--) sj_border.push(sj_at(0, sj_j));

  const sj_count = sj_border.length;
  const sj_rows = sj_ROWS.length;
  const sj_positions = new Float32Array(sj_count * sj_rows * 3);
  const sj_info = new Float32Array(sj_count * sj_rows * 3);
  sj_border.forEach(([sj_x, sj_z], sj_k) => {
    const sj_h = terrainHeight(sj_x, sj_z);
    const sj_len = Math.hypot(sj_x, sj_z) || 1;
    const sj_ox = sj_x / sj_len;
    const sj_oz = sj_z / sj_len;
    sj_ROWS.forEach((sj_row, sj_r) => {
      const sj_wobble = sj_r === 0 ? 0 : sj_noise.fbm2(sj_x * 0.03 + sj_r, sj_z * 0.03 - sj_r, 2);
      const sj_v = (sj_r * sj_count + sj_k) * 3;
      sj_positions[sj_v] = sj_x + sj_ox * sj_row.out * (1 + sj_wobble * 0.3);
      sj_positions[sj_v + 1] = sj_h - sj_row.down * (1 + sj_wobble * 0.35);
      sj_positions[sj_v + 2] = sj_z + sj_oz * sj_row.out * (1 + sj_wobble * 0.3);
      sj_info[sj_v] = 0.5;
      sj_info[sj_v + 1] = 0.6;
      sj_info[sj_v + 2] = 1;
    });
  });
  const sj_indices = new Uint32Array((sj_rows - 1) * sj_count * 6);
  let sj_o = 0;
  for (let sj_r = 0; sj_r < sj_rows - 1; sj_r++) {
    for (let sj_k = 0; sj_k < sj_count; sj_k++) {
      const sj_k1 = (sj_k + 1) % sj_count;
      const sj_a = sj_r * sj_count + sj_k;
      const sj_b = sj_r * sj_count + sj_k1;
      const sj_c = sj_a + sj_count;
      const sj_d = sj_b + sj_count;
      sj_indices[sj_o++] = sj_a;
      sj_indices[sj_o++] = sj_b;
      sj_indices[sj_o++] = sj_c;
      sj_indices[sj_o++] = sj_b;
      sj_indices[sj_o++] = sj_d;
      sj_indices[sj_o++] = sj_c;
    }
  }
  return { positions: sj_positions, info: sj_info, indices: sj_indices };
}
