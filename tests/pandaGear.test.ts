import { describe, expect, it } from 'vitest';
import { Vector3, type BufferGeometry } from 'three';
import { createScarfGeometry, createStrap } from '../src/player/pandaGear';

const a = new Vector3();
const b = new Vector3();
const c = new Vector3();
const n = new Vector3();
const face = new Vector3();

/** Each triangle of a (non-indexed or indexed) geometry, as three corner indices. */
function* triangles(g: BufferGeometry): Generator<[number, number, number]> {
  const index = g.index;
  const count = index ? index.count : g.attributes.position!.count;
  for (let i = 0; i < count; i += 3) {
    yield index ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)] : [i, i + 1, i + 2];
  }
}

/** Volume enclosed by a closed mesh: positive when its faces are wound to look outwards. */
function signedVolume(g: BufferGeometry): number {
  const p = g.attributes.position!;
  let volume = 0;
  for (const [i, j, k] of triangles(g)) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, j);
    c.fromBufferAttribute(p, k);
    volume += a.dot(n.crossVectors(b, c)) / 6;
  }
  return volume;
}

/** Share of triangles whose stored normals agree with the way they are wound. */
function normalsAgree(g: BufferGeometry): number {
  const p = g.attributes.position!;
  const normal = g.attributes.normal!;
  let agree = 0;
  let total = 0;
  for (const [i, j, k] of triangles(g)) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, j).sub(a);
    c.fromBufferAttribute(p, k).sub(a);
    face.crossVectors(b, c);
    n.fromBufferAttribute(normal, i)
      .add(a.fromBufferAttribute(normal, j))
      .add(b.fromBufferAttribute(normal, k));
    if (face.dot(n) > 0) agree++;
    total++;
  }
  return agree / total;
}

describe('panda gear', () => {
  const scarf = createScarfGeometry(new Vector3(-0.2, 0.71, 0.31));
  const strap = createStrap();

  it('winds the scarf and the strap with their outer faces to the front', () => {
    // (back-face culling would otherwise show the inside of the far wall instead)
    expect(signedVolume(scarf)).toBeGreaterThan(0);
    expect(signedVolume(strap)).toBeGreaterThan(0);
  });

  it('keeps normals that agree with the winding, for lighting', () => {
    expect(normalsAgree(scarf)).toBeGreaterThan(0.98);
    expect(normalsAgree(strap)).toBeGreaterThan(0.98);
  });

  it('wraps the scarf snugly round the neck', () => {
    const p = scarf.attributes.position!;
    let widest = 0;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < 0.7 || y > 0.95) continue;
      // body space: the torso is flattened front to back by 0.9
      widest = Math.max(widest, Math.hypot(p.getX(i), p.getZ(i) / 0.9));
    }
    // at most a few centimetres proud of the widest part of the shoulders (0.418)
    expect(widest).toBeLessThan(0.47);
    expect(widest).toBeGreaterThan(0.4);
  });
});
