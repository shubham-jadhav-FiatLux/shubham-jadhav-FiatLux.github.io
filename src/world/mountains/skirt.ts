import { CELL, terrainHeight } from '../heightfield';
import { TERRAIN_ORIGIN, TERRAIN_RES } from '../layout';
import { SimplexNoise } from '../../utils/noise';
import type { PeakMesh } from './peaks';

/** Rows of the skirt: how far out from the edge of the terrain and how far down (m). */
const ROWS = [
  { out: 0, down: 0 },
  { out: 6, down: 3 },
  { out: 16, down: 11 },
  { out: 30, down: 26 },
  { out: 52, down: 50 },
];

const noise = new SimplexNoise(8821);

/**
 * Wooded slopes falling away from the edge of the terrain into the sea of cloud, so the
 * edge of the world never shows from the air. The top row is exactly the terrain's own
 * border, so there is no seam.
 */
export function buildSkirt(): PeakMesh {
  const n = TERRAIN_RES;
  const border: [number, number][] = [];
  const at = (i: number, j: number): [number, number] => [
    TERRAIN_ORIGIN + i * CELL,
    TERRAIN_ORIGIN + j * CELL,
  ];
  for (let i = 0; i < n - 1; i++) border.push(at(i, 0));
  for (let j = 0; j < n - 1; j++) border.push(at(n - 1, j));
  for (let i = n - 1; i > 0; i--) border.push(at(i, n - 1));
  for (let j = n - 1; j > 0; j--) border.push(at(0, j));

  const count = border.length;
  const rows = ROWS.length;
  const positions = new Float32Array(count * rows * 3);
  const info = new Float32Array(count * rows * 3);
  border.forEach(([x, z], k) => {
    const h = terrainHeight(x, z);
    const len = Math.hypot(x, z) || 1;
    const ox = x / len;
    const oz = z / len;
    ROWS.forEach((row, r) => {
      const wobble = r === 0 ? 0 : noise.fbm2(x * 0.03 + r, z * 0.03 - r, 2);
      const v = (r * count + k) * 3;
      positions[v] = x + ox * row.out * (1 + wobble * 0.3);
      positions[v + 1] = h - row.down * (1 + wobble * 0.35);
      positions[v + 2] = z + oz * row.out * (1 + wobble * 0.3);
      info[v] = 0.5;
      info[v + 1] = 0.6;
      info[v + 2] = 1;
    });
  });
  const indices = new Uint32Array((rows - 1) * count * 6);
  let o = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let k = 0; k < count; k++) {
      const k1 = (k + 1) % count;
      const a = r * count + k;
      const b = r * count + k1;
      const c = a + count;
      const d = b + count;
      indices[o++] = a;
      indices[o++] = b;
      indices[o++] = c;
      indices[o++] = b;
      indices[o++] = d;
      indices[o++] = c;
    }
  }
  return { positions, info, indices };
}
