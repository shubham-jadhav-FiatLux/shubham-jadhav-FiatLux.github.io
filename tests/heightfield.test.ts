import { describe, expect, it } from 'vitest';
import {
  buildHeightGrid,
  lakeSdf,
  sampleGrid,
  terrainHeight,
  CELL,
} from '../src/world/heightfield';
import { FLAT_ZONES, PLACES, TERRAIN_ORIGIN, TERRAIN_RES, WATER_LEVEL } from '../src/world/layout';

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
});
