import { describe, expect, it } from 'vitest';
import { buildPeak, perches, type PeakSpec } from '../src/world/mountains/peaks';
import { buildPine, buildShrub } from '../src/world/mountains/pines';
import { buildSkirt } from '../src/world/mountains/skirt';
import { sj_RANGES, planRange } from '../src/world/mountains/Mountains';
import { terrainHeight } from '../src/world/heightfield';
import { sj_TERRAIN_ORIGIN } from '../src/world/layout';

const sj_spec = (sj_kind: PeakSpec['kind']): PeakSpec => ({
  kind: sj_kind,
  x: 200,
  z: -30,
  base: -10,
  height: 140,
  radius: 32,
  lean: 0.08,
  leanAngle: 1.2,
  seed: 77,
});

function checkMesh(sj_mesh: { positions: Float32Array; indices: Uint32Array; info: Float32Array }) {
  const sj_count = sj_mesh.positions.length / 3;
  expect(sj_mesh.info.length).toBe(sj_mesh.positions.length);
  expect(sj_mesh.indices.length % 3).toBe(0);
  for (const sj_i of sj_mesh.indices) expect(sj_i).toBeLessThan(sj_count);
  for (const sj_v of sj_mesh.positions) expect(Number.isFinite(sj_v)).toBe(true);
}

describe('mountain peaks', () => {
  for (const sj_kind of ['karst', 'spire', 'massif', 'dome'] as const) {
    it(`builds a closed, valid ${sj_kind}`, () => {
      const sj_mesh = buildPeak(sj_spec(sj_kind), { around: 24, rings: 16 });
      checkMesh(sj_mesh);
      // the last vertex is the summit, and nothing is higher
      const sj_n = sj_mesh.positions.length / 3;
      const sj_top = sj_mesh.positions[(sj_n - 1) * 3 + 1]!;
      expect(sj_top).toBeCloseTo(130, 5);
      for (let sj_i = 0; sj_i < sj_n; sj_i++)
        expect(sj_mesh.positions[sj_i * 3 + 1]!).toBeLessThanOrEqual(sj_top);
    });
  }

  it('is deterministic', () => {
    const sj_a = buildPeak(sj_spec('karst'), { around: 20, rings: 12 });
    const sj_b = buildPeak(sj_spec('karst'), { around: 20, rings: 12 });
    expect(Array.from(sj_a.positions)).toEqual(Array.from(sj_b.positions));
  });

  it('finds perches on the upper part of a peak', () => {
    for (const sj_p of perches(sj_spec('karst'), 30, 0.8, 1)) {
      expect(sj_p.y).toBeGreaterThanOrEqual(-10 + 140 * 0.8 - 1e-6);
      expect(Math.hypot(sj_p.ox, sj_p.oz)).toBeCloseTo(1, 5);
    }
  });

  it('builds trees and scrub', () => {
    checkMesh(buildPine(0, 0, 0, 9, 1, 0, 0.8, 3));
    const sj_shrub = buildShrub(0, 0, 0, 2, 0, 1, 5);
    checkMesh(sj_shrub);
    expect(sj_shrub.normals!.length).toBe(sj_shrub.positions.length);
  });
});

describe('mountain ranges', () => {
  it('keeps every footprint outside the valley', () => {
    for (const sj_range of sj_RANGES) {
      for (const sj_s of planRange(sj_range)) {
        expect(Math.hypot(sj_s.x, sj_s.z) - sj_s.radius, sj_range.name).toBeGreaterThanOrEqual(
          sj_range.keepOut - 1e-6,
        );
      }
    }
  });

  it('grows paler and taller with distance', () => {
    for (let sj_i = 1; sj_i < sj_RANGES.length; sj_i++) {
      expect(sj_RANGES[sj_i]!.inner).toBeGreaterThan(sj_RANGES[sj_i - 1]!.outer);
      expect(sj_RANGES[sj_i]!.heights[1]).toBeGreaterThan(sj_RANGES[sj_i - 1]!.heights[1]);
    }
  });
});

describe('terrain skirt', () => {
  it('starts exactly on the edge of the terrain and falls away from it', () => {
    const sj_skirt = buildSkirt();
    checkMesh(sj_skirt);
    // the first vertex is the north-west corner of the terrain
    expect(sj_skirt.positions[0]).toBeCloseTo(sj_TERRAIN_ORIGIN, 5);
    expect(sj_skirt.positions[2]).toBeCloseTo(sj_TERRAIN_ORIGIN, 5);
    expect(sj_skirt.positions[1]).toBeCloseTo(
      terrainHeight(sj_TERRAIN_ORIGIN, sj_TERRAIN_ORIGIN),
      4,
    );
    // the outermost row below the same border point is far lower
    const sj_perRow = sj_skirt.positions.length / 3 / 5;
    expect(sj_skirt.positions[4 * sj_perRow * 3 + 1]!).toBeLessThan(sj_skirt.positions[1]! - 30);
  });
});
