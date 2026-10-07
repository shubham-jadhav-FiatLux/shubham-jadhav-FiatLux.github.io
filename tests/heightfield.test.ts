import { describe, expect, it } from 'vitest';
import {
  buildHeightGrid,
  lakeSdf,
  sj_riverCourse,
  sampleGrid,
  terrainHeight,
  sj_CELL,
  sj_FALLS_TOP,
} from '../src/world/heightfield';
import {
  sj_FALLS,
  sj_FLAT_ZONES,
  sj_PLACES,
  sj_TERRAIN_ORIGIN,
  sj_TERRAIN_RES,
  sj_WATER_LEVEL,
} from '../src/world/layout';

const sj_grid = buildHeightGrid();

describe('heightfield', () => {
  it('is deterministic', () => {
    expect(terrainHeight(12.3, -4.5)).toBe(terrainHeight(12.3, -4.5));
  });

  it('keeps landmarks on dry land', () => {
    for (const sj_key of ['spawn', 'gate', 'crossroads', 'training', 'village', 'bell'] as const) {
      const sj_p = sj_PLACES[sj_key];
      expect(sampleGrid(sj_grid, sj_p.x, sj_p.z), sj_key).toBeGreaterThan(sj_WATER_LEVEL + 0.5);
    }
  });

  it('puts the pagoda on a hill top', () => {
    expect(sampleGrid(sj_grid, sj_PLACES.pagoda.x, sj_PLACES.pagoda.z)).toBeGreaterThan(8);
  });

  it('carves a lake deep enough to swim in', () => {
    expect(terrainHeight(28, -6)).toBeLessThan(-2);
    expect(lakeSdf(28, -6)).toBeLessThan(-10);
  });

  it('places the bridge ends and pavilion at the shoreline', () => {
    for (const sj_key of ['bridgeSouth', 'bridgeNorth', 'pavilion'] as const) {
      const sj_p = sj_PLACES[sj_key];
      expect(Math.abs(lakeSdf(sj_p.x, sj_p.z)), sj_key).toBeLessThan(3.5);
    }
  });

  it('flattens building plots', () => {
    for (const sj_z of sj_FLAT_ZONES) {
      let sj_min = Infinity;
      let sj_max = -Infinity;
      for (let sj_a = 0; sj_a < 16; sj_a++) {
        const sj_r = sj_z.radius * 0.8;
        const sj_h = terrainHeight(sj_z.x + Math.cos(sj_a) * sj_r, sj_z.z + Math.sin(sj_a) * sj_r);
        sj_min = Math.min(sj_min, sj_h);
        sj_max = Math.max(sj_max, sj_h);
      }
      expect(sj_max - sj_min, `zone at ${sj_z.x},${sj_z.z}`).toBeLessThan(0.15);
    }
  });

  it('samples the grid exactly at vertices', () => {
    for (const [sj_i, sj_j] of [
      [10, 10],
      [128, 128],
      [200, 57],
    ]) {
      const sj_x = sj_TERRAIN_ORIGIN + sj_i! * sj_CELL;
      const sj_z = sj_TERRAIN_ORIGIN + sj_j! * sj_CELL;
      expect(sampleGrid(sj_grid, sj_x, sj_z)).toBeCloseTo(
        sj_grid[sj_j! * sj_TERRAIN_RES + sj_i!]!,
        5,
      );
    }
  });

  it('is continuous between samples', () => {
    let sj_worst = 0;
    for (let sj_x = -60; sj_x < 60; sj_x += 0.37) {
      const sj_a = sampleGrid(sj_grid, sj_x, 5.1);
      const sj_b = sampleGrid(sj_grid, sj_x + 0.01, 5.1);
      sj_worst = Math.max(sj_worst, Math.abs(sj_a - sj_b));
    }
    expect(sj_worst).toBeLessThan(0.05);
  });

  it('runs the stream downhill all the way to the waterfall lip', () => {
    const sj_pts = sj_riverCourse.points;
    for (let sj_i = 1; sj_i < sj_pts.length; sj_i++) {
      expect(sj_pts[sj_i]!.bed).toBeLessThanOrEqual(sj_pts[sj_i - 1]!.bed);
    }
    const sj_lip = sj_pts[sj_pts.length - 1]!;
    expect(Math.hypot(sj_lip.x - sj_FALLS.lip.x, sj_lip.z - sj_FALLS.lip.z)).toBeLessThan(0.01);
    expect(sj_FALLS_TOP).toBeGreaterThan(10);
  });

  it('drops the waterfall into a deep plunge pool, not onto a beach', () => {
    expect(terrainHeight(sj_FALLS.foot.x, sj_FALLS.foot.z)).toBeLessThan(-1.5);
    expect(lakeSdf(sj_FALLS.foot.x, sj_FALLS.foot.z)).toBeLessThan(-1.5);
    // one metre back from the lip the ground is still up on the plateau
    const sj_back = { x: sj_FALLS.lip.x - sj_FALLS.dir.x, z: sj_FALLS.lip.z - sj_FALLS.dir.z };
    expect(terrainHeight(sj_back.x, sj_back.z)).toBeGreaterThan(sj_FALLS_TOP - 1.5);
  });

  it('keeps the rendered cliff edge at the lip, under the water', () => {
    // the rendered (sampled) ground, not just the analytic height: the stream's last
    // metres must run over ground, not over the drop
    for (const sj_back of [0, 0.5, 1]) {
      const sj_x = sj_FALLS.lip.x - sj_FALLS.dir.x * sj_back;
      const sj_z = sj_FALLS.lip.z - sj_FALLS.dir.z * sj_back;
      expect(sampleGrid(sj_grid, sj_x, sj_z)).toBeGreaterThan(sj_FALLS_TOP - 0.6);
    }
    // and a couple of metres out, it has dropped into the pool
    const sj_out = {
      x: sj_FALLS.lip.x + sj_FALLS.dir.x * 2,
      z: sj_FALLS.lip.z + sj_FALLS.dir.z * 2,
    };
    expect(sampleGrid(sj_grid, sj_out.x, sj_out.z)).toBeLessThan(sj_WATER_LEVEL);
  });
});
