import { BufferAttribute, BufferGeometry, Color, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Random } from '../../utils/random';

export type TreeKind = 'blossom' | 'broadleaf' | 'pine' | 'willow';

export interface TreeModel {
  trunk: BufferGeometry;
  canopy: BufferGeometry;
  /** willow only: hanging strands (drawn with the strand texture) */
  strands?: BufferGeometry;
  height: number;
  trunkRadius: number;
  /** horizontal radius of the crown (for shade and spacing) */
  crownRadius: number;
  /** blossom blobs (world-local), used to spawn falling petals */
  blobs: { center: Vector3; radius: number }[];
}

interface Branch {
  points: Vector3[];
  radii: number[];
}

interface Blob {
  center: Vector3;
  radius: number;
  squash: number;
}

const UP = new Vector3(0, 1, 0);
const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpQ = new Quaternion();

/** Tapered tube along a polyline with vertex colours and a wind height factor. */
function tube(
  b: Branch,
  radial: number,
  treeHeight: number,
  bark: Color,
  barkDark: Color,
  rand: Random,
): BufferGeometry {
  const rings = b.points.length;
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const wind: number[] = [];
  const idx: number[] = [];
  let prevSide = new Vector3(1, 0, 0);
  const c = new Color();
  for (let i = 0; i < rings; i++) {
    const p = b.points[i]!;
    const dir = tmpA
      .subVectors(b.points[Math.min(i + 1, rings - 1)]!, b.points[Math.max(i - 1, 0)]!)
      .normalize();
    // Parallel-transport-ish frame: keep the side vector close to the previous one.
    const side = prevSide.clone().addScaledVector(dir, -prevSide.dot(dir));
    if (side.lengthSq() < 1e-6) side.set(0, 0, 1).addScaledVector(dir, -dir.z);
    side.normalize();
    prevSide = side;
    const up = new Vector3().crossVectors(dir, side).normalize();
    const r = b.radii[i]!;
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const n = tmpB.copy(side).multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
      const bump = 1 + (rand.float() - 0.5) * 0.12;
      pos.push(p.x + n.x * r * bump, p.y + n.y * r * bump, p.z + n.z * r * bump);
      nrm.push(n.x, n.y, n.z);
      // bark: darker in grooves (alternating), lighter higher up
      c.copy(barkDark).lerp(
        bark,
        0.55 + 0.45 * Math.sin(a * 3 + i * 1.3) * 0.5 + rand.float() * 0.25,
      );
      col.push(c.r, c.g, c.b);
      wind.push(Math.min(1, Math.max(0, p.y / treeHeight)) * 0.8, 0);
    }
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * radial + k;
      const b2 = i * radial + ((k + 1) % radial);
      const c2 = (i + 1) * radial + k;
      const d = (i + 1) * radial + ((k + 1) % radial);
      idx.push(a, c2, b2, b2, c2, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setAttribute('aWind', new BufferAttribute(new Float32Array(wind), 2));
  g.setIndex(idx);
  return g;
}

/** A curved branch from `start` heading along `dir`, bending towards `bendTo`. */
function makeBranch(
  rand: Random,
  start: Vector3,
  dir: Vector3,
  length: number,
  r0: number,
  r1: number,
  segments: number,
  bendTo: Vector3,
  wobble: number,
): Branch {
  const points: Vector3[] = [start.clone()];
  const radii: number[] = [r0];
  const d = dir.clone().normalize();
  const p = start.clone();
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    d.lerp(bendTo, 0.18).normalize();
    d.x += rand.spread(wobble);
    d.z += rand.spread(wobble);
    d.y += rand.spread(wobble * 0.5);
    d.normalize();
    p.addScaledVector(d, length / segments);
    points.push(p.clone());
    radii.push(r0 + (r1 - r0) * Math.pow(t, 0.8));
  }
  return { points, radii };
}

function randomDirection(_rand: Random, azimuth: number, elevation: number): Vector3 {
  const ce = Math.cos(elevation);
  return new Vector3(Math.cos(azimuth) * ce, Math.sin(elevation), Math.sin(azimuth) * ce);
}

/** Alpha-tested cards scattered through canopy blobs, lit with spherical normals. */
function canopyCards(
  blobs: Blob[],
  rand: Random,
  treeHeight: number,
  tint: Color,
  tintVariance: number,
  cardScale: number,
  density: number,
): BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const wind: number[] = [];
  const idx: number[] = [];
  const c = new Color();
  const axis = new Vector3();
  const u = new Vector3();
  const v = new Vector3();
  let vi = 0;
  for (const blob of blobs) {
    const count = Math.round(Math.min(46, Math.max(9, 17 * (blob.radius / 1.2) ** 2)) * density);
    for (let i = 0; i < count; i++) {
      // point biased towards the surface of the (squashed) sphere
      const dir = new Vector3(rand.spread(1), rand.spread(1), rand.spread(1));
      if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0);
      dir.normalize();
      const rr = blob.radius * Math.pow(rand.float(), 0.35) * 0.82;
      const center = blob.center
        .clone()
        .add(new Vector3(dir.x * rr, dir.y * rr * blob.squash, dir.z * rr));
      const size = blob.radius * cardScale * rand.range(0.75, 1.15);
      axis.set(rand.spread(1), rand.spread(1), rand.spread(1)).normalize();
      tmpQ.setFromAxisAngle(axis, rand.range(0, Math.PI));
      u.set(1, 0, 0)
        .applyQuaternion(tmpQ)
        .multiplyScalar(size * 0.5);
      v.set(0, 1, 0)
        .applyQuaternion(tmpQ)
        .multiplyScalar(size * 0.5);
      const depth = rr / blob.radius; // 0 = core, 1 = surface
      const heightF = Math.min(1, Math.max(0, center.y / treeHeight));
      const ao = 0.5 + 0.5 * depth * (0.75 + 0.25 * heightF);
      c.copy(tint).multiplyScalar((1 + rand.spread(tintVariance)) * ao);
      const corners: [number, number][] = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ];
      const rot = rand.int(0, 3);
      corners.forEach(([a, b], k) => {
        const px = center.x + u.x * a + v.x * b;
        const py = center.y + u.y * a + v.y * b;
        const pz = center.z + u.z * a + v.z * b;
        pos.push(px, py, pz);
        // spherical normal from the blob centre, nudged upwards (sky light)
        const n = tmpA
          .set(px - blob.center.x, (py - blob.center.y) / blob.squash, pz - blob.center.z)
          .normalize()
          .lerp(UP, 0.25)
          .normalize();
        nrm.push(n.x, n.y, n.z);
        const [uu, vv] = corners[(k + rot) % 4]!;
        uv.push((uu + 1) / 2, (vv + 1) / 2);
        col.push(c.r, c.g, c.b);
        wind.push(Math.min(1.2, py / treeHeight), 1);
      });
      idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      vi += 4;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setAttribute('aWind', new BufferAttribute(new Float32Array(wind), 2));
  g.setIndex(idx);
  return g;
}

/** Hanging willow strands: tall cards dangling from an upper dome. */
function willowStrands(
  anchors: Vector3[],
  rand: Random,
  treeHeight: number,
  tint: Color,
): BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const wind: number[] = [];
  const idx: number[] = [];
  const c = new Color();
  let vi = 0;
  for (const a of anchors) {
    const reach = a.y - rand.range(0.35, 1.2);
    const len = Math.max(0.8, reach * rand.range(0.45, 1));
    const width = rand.range(0.28, 0.42);
    const out = new Vector3(a.x, 0, a.z).normalize();
    if (out.lengthSq() < 1e-4) out.set(1, 0, 0);
    const side = new Vector3(-out.z, 0, out.x).applyAxisAngle(UP, rand.spread(0.6));
    c.copy(tint).multiplyScalar(1 + rand.spread(0.12));
    const top = a;
    const flare = rand.range(0.1, 0.5);
    const bottom = a.clone().add(new Vector3(out.x * flare, -len, out.z * flare));
    const verts = [
      top.clone().addScaledVector(side, -width / 2),
      top.clone().addScaledVector(side, width / 2),
      bottom.clone().addScaledVector(side, width / 2),
      bottom.clone().addScaledVector(side, -width / 2),
    ];
    const uvs = [
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ];
    verts.forEach((p, k) => {
      pos.push(p.x, p.y, p.z);
      const n = out.clone().lerp(UP, 0.2).normalize();
      nrm.push(n.x, n.y, n.z);
      uv.push(uvs[k]![0]!, uvs[k]![1]!);
      const shade = k < 2 ? 1 : 0.8;
      col.push(c.r * shade, c.g * shade, c.b * shade);
      wind.push(k < 2 ? 0.7 : 1.6, k < 2 ? 0.2 : 1);
    });
    idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    vi += 4;
  }
  void treeHeight;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setAttribute('aWind', new BufferAttribute(new Float32Array(wind), 2));
  g.setIndex(idx);
  return g;
}

export interface TreeOptions {
  kind: TreeKind;
  seed: number;
  /** multiplies the default number of canopy cards (quality) */
  density?: number;
}

/** Grows one tree variant. Coordinates are local with the trunk base at the origin. */
export function growTree({ kind, seed, density = 1 }: TreeOptions): TreeModel {
  const rand = new Random(seed);
  const branches: Branch[] = [];
  const blobs: Blob[] = [];
  let height = 6;
  let trunkRadius: number;
  const bark = new Color('#6b4a36');
  const barkDark = new Color('#3e2a20');
  let tint = new Color('#ffffff');
  let cardScale: number;
  let tintVariance = 0.12;
  const willowAnchors: Vector3[] = [];

  if (kind === 'blossom') {
    bark.set('#5a3d2e');
    barkDark.set('#2f1f18');
    const trunkH = rand.range(1.8, 2.6);
    trunkRadius = rand.range(0.2, 0.28);
    const lean = randomDirection(rand, rand.range(0, 6.28), 1.25);
    const trunk = makeBranch(
      rand,
      new Vector3(),
      lean,
      trunkH,
      trunkRadius,
      trunkRadius * 0.7,
      4,
      UP,
      0.12,
    );
    branches.push(trunk);
    const top = trunk.points[trunk.points.length - 1]!;
    const mains = rand.int(4, 5);
    const az0 = rand.range(0, 6.28);
    for (let i = 0; i < mains; i++) {
      const az = az0 + (i / mains) * Math.PI * 2 + rand.spread(0.4);
      const dir = randomDirection(rand, az, rand.range(0.45, 0.85));
      const len = rand.range(1.8, 2.6);
      const main = makeBranch(
        rand,
        top,
        dir,
        len,
        trunkRadius * 0.62,
        0.07,
        3,
        randomDirection(rand, az, 0.25),
        0.12,
      );
      branches.push(main);
      const end = main.points[main.points.length - 1]!;
      const subs = rand.int(2, 3);
      for (let s = 0; s < subs; s++) {
        const sdir = randomDirection(rand, az + rand.spread(0.9), rand.range(0.2, 0.9));
        const sub = makeBranch(
          rand,
          main.points[2]!,
          sdir,
          rand.range(0.9, 1.5),
          0.07,
          0.025,
          2,
          UP,
          0.15,
        );
        branches.push(sub);
        const se = sub.points[sub.points.length - 1]!;
        blobs.push({ center: se.clone(), radius: rand.range(0.9, 1.25), squash: 0.72 });
      }
      blobs.push({
        center: end.clone().add(new Vector3(0, 0.2, 0)),
        radius: rand.range(1.2, 1.55),
        squash: 0.7,
      });
    }
    blobs.push({ center: top.clone().add(new Vector3(0, 1.3, 0)), radius: 1.5, squash: 0.7 });
    height = Math.max(...blobs.map((b) => b.center.y + b.radius * b.squash));
    cardScale = 1.05;
    tintVariance = 0.08;
  } else if (kind === 'broadleaf') {
    bark.set('#6a5140');
    const trunkH = rand.range(2.4, 3.4);
    trunkRadius = rand.range(0.22, 0.3);
    const trunk = makeBranch(
      rand,
      new Vector3(),
      randomDirection(rand, rand.range(0, 6.28), 1.4),
      trunkH,
      trunkRadius,
      trunkRadius * 0.65,
      4,
      UP,
      0.06,
    );
    branches.push(trunk);
    const top = trunk.points[trunk.points.length - 1]!;
    const mains = rand.int(3, 5);
    for (let i = 0; i < mains; i++) {
      const az = (i / mains) * Math.PI * 2 + rand.spread(0.5);
      const dir = randomDirection(rand, az, rand.range(0.7, 1.1));
      const main = makeBranch(
        rand,
        top,
        dir,
        rand.range(1.5, 2.4),
        trunkRadius * 0.55,
        0.06,
        3,
        UP,
        0.1,
      );
      branches.push(main);
      const end = main.points[main.points.length - 1]!;
      blobs.push({ center: end.clone(), radius: rand.range(1.5, 2.1), squash: 0.85 });
    }
    blobs.push({ center: top.clone().add(new Vector3(0, 2.2, 0)), radius: 2, squash: 0.85 });
    height = Math.max(...blobs.map((b) => b.center.y + b.radius * b.squash));
    tint = new Color('#ffffff');
    cardScale = 1.15;
  } else if (kind === 'pine') {
    bark.set('#5e4a3c');
    barkDark.set('#352a22');
    const trunkH = rand.range(5, 7.5);
    trunkRadius = rand.range(0.22, 0.32);
    const lean = randomDirection(rand, rand.range(0, 6.28), rand.range(1.15, 1.35));
    const trunk = makeBranch(rand, new Vector3(), lean, trunkH, trunkRadius, 0.08, 6, UP, 0.14);
    branches.push(trunk);
    // Layered horizontal "cloud" pads, like the pines on painted mountains.
    const tiers = rand.int(3, 5);
    for (let i = 0; i < tiers; i++) {
      const t = 0.45 + (i / tiers) * 0.55;
      const idx = Math.min(trunk.points.length - 1, Math.round(t * (trunk.points.length - 1)));
      const at = trunk.points[idx]!;
      const az = rand.range(0, 6.28);
      const len = (1 - t) * rand.range(2.2, 3.2) + 0.6;
      const dir = randomDirection(rand, az, rand.range(-0.05, 0.2));
      const b = makeBranch(rand, at, dir, len, 0.1, 0.03, 3, dir.clone().setY(0.1), 0.1);
      branches.push(b);
      const end = b.points[b.points.length - 1]!;
      blobs.push({
        center: end.clone().add(new Vector3(0, 0.15, 0)),
        radius: rand.range(1.1, 1.6) * (1.1 - t * 0.3),
        squash: 0.38,
      });
    }
    const top = trunk.points[trunk.points.length - 1]!;
    blobs.push({ center: top.clone().add(new Vector3(0, 0.2, 0)), radius: 1.3, squash: 0.42 });
    height = Math.max(...blobs.map((b) => b.center.y + b.radius * b.squash));
    cardScale = 1.25;
  } else {
    // willow
    bark.set('#5d4a3a');
    const trunkH = rand.range(2, 2.8);
    trunkRadius = rand.range(0.28, 0.36);
    const trunk = makeBranch(
      rand,
      new Vector3(),
      randomDirection(rand, rand.range(0, 6.28), 1.3),
      trunkH,
      trunkRadius,
      trunkRadius * 0.7,
      4,
      UP,
      0.1,
    );
    branches.push(trunk);
    const top = trunk.points[trunk.points.length - 1]!;
    const mains = rand.int(5, 7);
    let topY = top.y;
    for (let i = 0; i < mains; i++) {
      const az = (i / mains) * Math.PI * 2 + rand.spread(0.3);
      const dir = randomDirection(rand, az, rand.range(0.75, 1.05));
      const main = makeBranch(
        rand,
        top,
        dir,
        rand.range(2.0, 2.8),
        trunkRadius * 0.5,
        0.05,
        4,
        randomDirection(rand, az, 0.05),
        0.08,
      );
      branches.push(main);
      // Strands hang from the outer part of each branch, in uneven clusters.
      for (let k = 2; k < main.points.length; k++) {
        const at = main.points[k]!;
        topY = Math.max(topY, at.y);
        const n = Math.round(rand.int(4, 8) * density);
        for (let j = 0; j < n; j++) {
          willowAnchors.push(
            at.clone().add(new Vector3(rand.spread(0.7), rand.range(-0.1, 0.3), rand.spread(0.7))),
          );
        }
      }
      const end = main.points[main.points.length - 1]!;
      blobs.push({
        center: end.clone().add(new Vector3(0, 0.25, 0)),
        radius: rand.range(0.9, 1.3),
        squash: 0.55,
      });
    }
    blobs.push({ center: top.clone().add(new Vector3(0, 1.4, 0)), radius: 1.5, squash: 0.55 });
    const domeR = 2.8;
    const domeY = topY;
    height = domeY + domeR * 0.5;
    cardScale = 1.1;
  }

  const trunkParts = branches.map((b, i) =>
    tube(b, i === 0 ? 9 : b.radii[0]! > 0.1 ? 6 : 4, height, bark, barkDark, rand),
  );
  const trunk = mergeGeometries(trunkParts, false)!;
  trunkParts.forEach((p) => p.dispose());

  let canopy: BufferGeometry;
  let strands: BufferGeometry | undefined;
  if (kind === 'willow') {
    canopy = canopyCards(blobs, rand, height, new Color('#e8f2c6'), 0.1, 0.9, density * 0.55);
    strands = willowStrands(willowAnchors, rand, height, new Color('#ffffff'));
  } else {
    canopy = canopyCards(blobs, rand, height, tint, tintVariance, cardScale, density);
  }

  let crownRadius = 0;
  for (const b of blobs)
    crownRadius = Math.max(crownRadius, Math.hypot(b.center.x, b.center.z) + b.radius);

  return {
    trunk,
    canopy,
    strands,
    height,
    trunkRadius,
    crownRadius,
    blobs: blobs.map((b) => ({ center: b.center.clone(), radius: b.radius })),
  };
}
