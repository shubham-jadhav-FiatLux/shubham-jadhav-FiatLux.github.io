import { describe, expect, it } from 'vitest';
import { angleDelta, damp, distToSegment, smoothstep, wrapAngle } from '../src/utils/math';
import { Random } from '../src/utils/random';
import { SimplexNoise } from '../src/utils/noise';

describe('math helpers', () => {
  it('wraps angles into [-PI, PI)', () => {
    expect(Math.abs(wrapAngle(3 * Math.PI))).toBeCloseTo(Math.PI, 6);
    expect(wrapAngle(0.5 + 4 * Math.PI)).toBeCloseTo(0.5, 6);
    expect(Math.abs(wrapAngle(-3 * Math.PI))).toBeCloseTo(Math.PI, 6);
    expect(angleDelta(0.1, -0.1)).toBeCloseTo(-0.2, 6);
    expect(angleDelta(3.1, -3.1)).toBeCloseTo(2 * Math.PI - 6.2, 6);
  });

  it('damps towards the target independently of frame rate', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 1, 5, 1 / 60);
    let b = 0;
    for (let i = 0; i < 30; i++) b = damp(b, 1, 5, 1 / 30);
    expect(a).toBeCloseTo(b, 6);
  });

  it('computes smoothstep and segment distance', () => {
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(distToSegment(0, 1, -1, 0, 1, 0)).toBe(1);
  });
});

describe('random and noise', () => {
  it('is reproducible from a seed', () => {
    const a = new Random(42);
    const b = new Random(42);
    for (let i = 0; i < 5; i++) expect(a.float()).toBe(b.float());
  });

  it('keeps simplex noise in range', () => {
    const n = new SimplexNoise(7);
    for (let i = 0; i < 1000; i++) {
      const v = n.noise2(i * 0.37, i * 0.11);
      expect(v).toBeGreaterThanOrEqual(-1.001);
      expect(v).toBeLessThanOrEqual(1.001);
    }
  });
});
