import { describe, expect, it } from 'vitest';
import { CollisionWorld, pushOut, shapeContains } from '../src/physics/CollisionWorld';

describe('collision shapes', () => {
  it('pushes a body out of a circle', () => {
    const body = { x: 0.5, y: 0, z: 0 };
    expect(pushOut({ type: 'circle', x: 0, z: 0, r: 1 }, body, 0.4)).toBe(true);
    expect(Math.hypot(body.x, body.z)).toBeCloseTo(1.4, 5);
  });

  it('pushes a body out of a rotated box through the nearest face', () => {
    const box = { type: 'box' as const, x: 0, z: 0, hx: 2, hz: 0.5, rot: Math.PI / 2 };
    // Rotated 90°: the long side now runs along z.
    expect(shapeContains(box, 0, 1.8)).toBe(true);
    expect(shapeContains(box, 1.8, 0)).toBe(false);
    const body = { x: 0.3, y: 0, z: 0 };
    pushOut(box, body, 0.4);
    expect(body.x).toBeCloseTo(0.9, 5);
  });

  it('ignores obstacles outside the body height range', () => {
    const world = new CollisionWorld();
    world.circle(0, 0, 1, 2, 3);
    const body = { x: 0.2, y: 0, z: 0 };
    world.resolve(body, 0.4, 1.3, 0.45);
    expect(body.x).toBeCloseTo(0.2, 5);
  });

  it('lets the body step onto low platforms and blocks tall ones', () => {
    const world = new CollisionWorld();
    world.addPlatform({
      shape: { type: 'circle', x: 0, z: 0, r: 1 },
      top: 0.3,
      bottom: 0,
      surface: 'stone',
    });
    world.addPlatform({
      shape: { type: 'circle', x: 5, z: 0, r: 1 },
      top: 2,
      bottom: 0,
      surface: 'stone',
    });
    expect(world.platformAt(0, 0, 0, 0.45)?.top).toBe(0.3);
    expect(world.platformAt(5, 0, 0, 0.45)).toBeNull();
    const body = { x: 4.5, y: 0, z: 0 };
    world.resolve(body, 0.4, 1.3, 0.45);
    expect(body.x).toBeLessThan(4.2);
  });

  it('finds tagged obstacles nearby', () => {
    const world = new CollisionWorld();
    world.circle(3, 3, 0.3, 0, 2, 'dummy:0');
    world.circle(30, 3, 0.3, 0, 2, 'dummy:1');
    expect(world.findTagged(2, 3, 1.5, 'dummy').map((o) => o.tag)).toEqual(['dummy:0']);
  });
});
