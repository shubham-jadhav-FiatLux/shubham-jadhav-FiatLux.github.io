import { describe, expect, it } from 'vitest';
import { buildPeak, perches, type PeakSpec } from '../src/world/mountains/peaks';
import { buildPine, buildShrub } from '../src/world/mountains/pines';
import { buildSkirt } from '../src/world/mountains/skirt';
import { RANGES, planRange } from '../src/world/mountains/Mountains';
import { terrainHeight } from '../src/world/heightfield';
import { TERRAIN_ORIGIN } from '../src/world/layout';

const spec = (kind: PeakSpec['kind']): PeakSpec => ({
  kind,
  x: 200,
  z: -30,
  base: -10,
  height: 140,
  radius: 32,
  lean: 0.08,
  leanAngle: 1.2,
  seed: 77,
});

function checkMesh(mesh: { positions: Float32Array; indices: Uint32Array; info: Float32Array }) {
  const count = mesh.positions.length / 3;
  expect(mesh.info.length).toBe(mesh.positions.length);
  expect(mesh.indices.length % 3).toBe(0);
  for (const i of mesh.indices) expect(i).toBeLessThan(count);
  for (const v of mesh.positions) expect(Number.isFinite(v)).toBe(true);
}

describe('mountain peaks', () => {
  for (const kind of ['karst', 'spire', 'massif', 'dome'] as const) {
    it(`builds a closed, valid ${kind}`, () => {
      const mesh = buildPeak(spec(kind), { around: 24, rings: 16 });
      checkMesh(mesh);
      // the last vertex is the summit, and nothing is higher
      const n = mesh.positions.length / 3;
      const top = mesh.positions[(n - 1) * 3 + 1]!;
      expect(top).toBeCloseTo(130, 5);
      for (let i = 0; i < n; i++) expect(mesh.positions[i * 3 + 1]!).toBeLessThanOrEqual(top);
    });
  }

  it('is deterministic', () => {
    const a = buildPeak(spec('karst'), { around: 20, rings: 12 });
    const b = buildPeak(spec('karst'), { around: 20, rings: 12 });
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
  });

  it('finds perches on the upper part of a peak', () => {
    for (const p of perches(spec('karst'), 30, 0.8, 1)) {
      expect(p.y).toBeGreaterThanOrEqual(-10 + 140 * 0.8 - 1e-6);
      expect(Math.hypot(p.ox, p.oz)).toBeCloseTo(1, 5);
    }
  });

  it('builds trees and scrub', () => {
    checkMesh(buildPine(0, 0, 0, 9, 1, 0, 0.8, 3));
    const shrub = buildShrub(0, 0, 0, 2, 0, 1, 5);
    checkMesh(shrub);
    expect(shrub.normals!.length).toBe(shrub.positions.length);
  });
});

describe('mountain ranges', () => {
  it('keeps every footprint outside the valley', () => {
    for (const range of RANGES) {
      for (const s of planRange(range)) {
        expect(Math.hypot(s.x, s.z) - s.radius, range.name).toBeGreaterThanOrEqual(
          range.keepOut - 1e-6,
        );
      }
    }
  });

  it('grows paler and taller with distance', () => {
    for (let i = 1; i < RANGES.length; i++) {
      expect(RANGES[i]!.inner).toBeGreaterThan(RANGES[i - 1]!.outer);
      expect(RANGES[i]!.heights[1]).toBeGreaterThan(RANGES[i - 1]!.heights[1]);
    }
  });
});

describe('terrain skirt', () => {
  it('starts exactly on the edge of the terrain and falls away from it', () => {
    const skirt = buildSkirt();
    checkMesh(skirt);
    // the first vertex is the north-west corner of the terrain
    expect(skirt.positions[0]).toBeCloseTo(TERRAIN_ORIGIN, 5);
    expect(skirt.positions[2]).toBeCloseTo(TERRAIN_ORIGIN, 5);
    expect(skirt.positions[1]).toBeCloseTo(terrainHeight(TERRAIN_ORIGIN, TERRAIN_ORIGIN), 4);
    // the outermost row below the same border point is far lower
    const perRow = skirt.positions.length / 3 / 5;
    expect(skirt.positions[4 * perRow * 3 + 1]!).toBeLessThan(skirt.positions[1]! - 30);
  });
});
