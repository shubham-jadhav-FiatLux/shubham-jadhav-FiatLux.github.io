import { describe, expect, it } from 'vitest';
import { Vector3, type BufferGeometry } from 'three';
import { createScarfGeometry, createStrap } from '../src/player/pandaGear';

const sj_a = new Vector3();
const sj_b = new Vector3();
const sj_c = new Vector3();
const sj_n = new Vector3();
const sj_face = new Vector3();

/** Each triangle of a (non-indexed or indexed) geometry, as three corner indices. */
function* triangles(sj_g: BufferGeometry): Generator<[number, number, number]> {
  const sj_index = sj_g.index;
  const sj_count = sj_index ? sj_index.count : sj_g.attributes.position!.count;
  for (let sj_i = 0; sj_i < sj_count; sj_i += 3) {
    yield sj_index
      ? [sj_index.getX(sj_i), sj_index.getX(sj_i + 1), sj_index.getX(sj_i + 2)]
      : [sj_i, sj_i + 1, sj_i + 2];
  }
}

/** Volume enclosed by a closed mesh: positive when its faces are wound to look outwards. */
function signedVolume(sj_g: BufferGeometry): number {
  const sj_p = sj_g.attributes.position!;
  let sj_volume = 0;
  for (const [sj_i, sj_j, sj_k] of triangles(sj_g)) {
    sj_a.fromBufferAttribute(sj_p, sj_i);
    sj_b.fromBufferAttribute(sj_p, sj_j);
    sj_c.fromBufferAttribute(sj_p, sj_k);
    sj_volume += sj_a.dot(sj_n.crossVectors(sj_b, sj_c)) / 6;
  }
  return sj_volume;
}

/** Share of triangles whose stored normals agree with the way they are wound. */
function normalsAgree(sj_g: BufferGeometry): number {
  const sj_p = sj_g.attributes.position!;
  const sj_normal = sj_g.attributes.normal!;
  let sj_agree = 0;
  let sj_total = 0;
  for (const [sj_i, sj_j, sj_k] of triangles(sj_g)) {
    sj_a.fromBufferAttribute(sj_p, sj_i);
    sj_b.fromBufferAttribute(sj_p, sj_j).sub(sj_a);
    sj_c.fromBufferAttribute(sj_p, sj_k).sub(sj_a);
    sj_face.crossVectors(sj_b, sj_c);
    sj_n
      .fromBufferAttribute(sj_normal, sj_i)
      .add(sj_a.fromBufferAttribute(sj_normal, sj_j))
      .add(sj_b.fromBufferAttribute(sj_normal, sj_k));
    if (sj_face.dot(sj_n) > 0) sj_agree++;
    sj_total++;
  }
  return sj_agree / sj_total;
}

describe('panda gear', () => {
  const sj_scarf = createScarfGeometry(new Vector3(-0.2, 0.71, 0.31));
  const sj_strap = createStrap();

  it('winds the scarf and the strap with their outer faces to the front', () => {
    // (back-face culling would otherwise show the inside of the far wall instead)
    expect(signedVolume(sj_scarf)).toBeGreaterThan(0);
    expect(signedVolume(sj_strap)).toBeGreaterThan(0);
  });

  it('keeps normals that agree with the winding, for lighting', () => {
    expect(normalsAgree(sj_scarf)).toBeGreaterThan(0.98);
    expect(normalsAgree(sj_strap)).toBeGreaterThan(0.98);
  });

  it('wraps the scarf snugly round the neck', () => {
    const sj_p = sj_scarf.attributes.position!;
    let sj_widest = 0;
    for (let sj_i = 0; sj_i < sj_p.count; sj_i++) {
      const sj_y = sj_p.getY(sj_i);
      if (sj_y < 0.7 || sj_y > 0.95) continue;
      // body space: the torso is flattened front to back by 0.9
      sj_widest = Math.max(sj_widest, Math.hypot(sj_p.getX(sj_i), sj_p.getZ(sj_i) / 0.9));
    }
    // at most a few centimetres proud of the widest part of the shoulders (0.418)
    expect(sj_widest).toBeLessThan(0.47);
    expect(sj_widest).toBeGreaterThan(0.4);
  });
});
