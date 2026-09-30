import { describe, expect, it } from 'vitest';
import {
  buildHeightGrid,
  lakeSdf,
  riverCourse,
  sampleGrid,
  terrainHeight,
  CELL,
  FALLS_TOP,
} from '../src/world/heightfield';
import {
  FALLS,
  FLAT_ZONES,
  PLACES,
  TERRAIN_ORIGIN,
  TERRAIN_RES,
  WATER_LEVEL,
} from '../src/world/layout';

const grid = buildHeightGrid();

describe('heightfield', () => {
  it('is deterministic', () => {
    expect(terrainHeight(12.3, -4.5)).toBe(terrainHeight(12.3, -4.5));
  });

  it('keeps landmarks on dry land', () => {
    for (const key of ['spawn', 'gate', 'crossroads', 'training', 'village', 'bell'] as const) {
      const p = PLACES[key];
      expect(sampleGrid(grid, p.x, p.z), key).toBeGreaterThan(WATER_LEVEL + 0.5);
    }
  });

  it('puts the pagoda on a hill top', () => {
    expect(sampleGrid(grid, PLACES.pagoda.x, PLACES.pagoda.z)).toBeGreaterThan(8);
  });

  it('carves a lake deep enough to swim in', () => {
    expect(terrainHeight(28, -6)).toBeLessThan(-2);
    expect(lakeSdf(28, -6)).toBeLessThan(-10);
  });

  it('places the bridge ends and pavilion at the shoreline', () => {
    for (const key of ['bridgeSouth', 'bridgeNorth', 'pavilion'] as const) {
      const p = PLACES[key];
      expect(Math.abs(lakeSdf(p.x, p.z)), key).toBeLessThan(3.5);
    }
  });

  it('flattens building plots', () => {
    for (const z of FLAT_ZONES) {
      let min = Infinity;
      let max = -Infinity;
      for (let a = 0; a < 16; a++) {
        const r = z.radius * 0.8;
        const h = terrainHeight(z.x + Math.cos(a) * r, z.z + Math.sin(a) * r);
        min = Math.min(min, h);
        max = Math.max(max, h);
      }
      expect(max - min, `zone at ${z.x},${z.z}`).toBeLessThan(0.15);
    }
  });

  it('samples the grid exactly at vertices', () => {
    for (const [i, j] of [
      [10, 10],
      [128, 128],
      [200, 57],
    ]) {
      const x = TERRAIN_ORIGIN + i! * CELL;
      const z = TERRAIN_ORIGIN + j! * CELL;
      expect(sampleGrid(grid, x, z)).toBeCloseTo(grid[j! * TERRAIN_RES + i!]!, 5);
    }
  });

  it('is continuous between samples', () => {
    let worst = 0;
    for (let x = -60; x < 60; x += 0.37) {
      const a = sampleGrid(grid, x, 5.1);
      const b = sampleGrid(grid, x + 0.01, 5.1);
      worst = Math.max(worst, Math.abs(a - b));
    }
    expect(worst).toBeLessThan(0.05);
  });

  it('runs the stream downhill all the way to the waterfall lip', () => {
    const pts = riverCourse.points;
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]!.bed).toBeLessThanOrEqual(pts[i - 1]!.bed);
    }
    const lip = pts[pts.length - 1]!;
    expect(Math.hypot(lip.x - FALLS.lip.x, lip.z - FALLS.lip.z)).toBeLessThan(0.01);
    expect(FALLS_TOP).toBeGreaterThan(10);
  });

  it('drops the waterfall into a deep plunge pool, not onto a beach', () => {
    expect(terrainHeight(FALLS.foot.x, FALLS.foot.z)).toBeLessThan(-1.5);
    expect(lakeSdf(FALLS.foot.x, FALLS.foot.z)).toBeLessThan(-1.5);
    // one metre back from the lip the ground is still up on the plateau
    const back = { x: FALLS.lip.x - FALLS.dir.x, z: FALLS.lip.z - FALLS.dir.z };
    expect(terrainHeight(back.x, back.z)).toBeGreaterThan(FALLS_TOP - 1.5);
  });

  it('keeps the rendered cliff edge at the lip, under the water', () => {
    // the rendered (sampled) ground, not just the analytic height: the stream's last
    // metres must run over ground, not over the drop
    for (const back of [0, 0.5, 1]) {
      const x = FALLS.lip.x - FALLS.dir.x * back;
      const z = FALLS.lip.z - FALLS.dir.z * back;
      expect(sampleGrid(grid, x, z)).toBeGreaterThan(FALLS_TOP - 0.6);
    }
    // and a couple of metres out, it has dropped into the pool
    const out = { x: FALLS.lip.x + FALLS.dir.x * 2, z: FALLS.lip.z + FALLS.dir.z * 2 };
    expect(sampleGrid(grid, out.x, out.z)).toBeLessThan(WATER_LEVEL);
  });
});
