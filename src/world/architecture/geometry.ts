import { BoxGeometry, BufferAttribute, BufferGeometry, CylinderGeometry, Vector3 } from 'three';

/**
 * Parametric Chinese roofs. Surfaces are concave (they rise slowly at the eaves and
 * steeply near the ridge) and the eaves curl upwards towards the corners.
 */
export interface RoofOptions {
  /** rise from eave to ridge (m) */
  height: number;
  /** how far the corners curl upwards (m) */
  lift: number;
  /** concavity exponent (1 = straight, 1.6 = classic sag) */
  sag?: number;
  /** horizontal outward flare of the corners (fraction) */
  flare?: number;
  /** slab thickness (m) */
  thickness?: number;
  /** stop the faces at this fraction of the way to the apex (tiered pagoda skirts) */
  vMax?: number;
  segmentsU?: number;
  segmentsV?: number;
}

interface FaceFn {
  (u: number, v: number): Vector3;
}

function surfaceY(u: number, v: number, o: RoofOptions): number {
  const sag = o.sag ?? 1.6;
  return o.height * Math.pow(v, sag) + o.lift * Math.pow(Math.abs(u), 3) * Math.pow(1 - v, 2);
}

/**
 * Builds top surface, underside and fascia for a set of faces. Each face maps
 * (u ∈ [-1, 1] along the eave, v ∈ [0, vMax] up the slope) to a point.
 * UVs are in metres (u along the eave, v up the slope) for the tile shader.
 */
function buildFaces(
  faces: FaceFn[],
  o: RoofOptions,
): { top: BufferGeometry; under: BufferGeometry } {
  const nu = o.segmentsU ?? 14;
  const nv = o.segmentsV ?? 8;
  const vMax = o.vMax ?? 1;
  const t = o.thickness ?? 0.12;
  const topPos: number[] = [];
  const topUv: number[] = [];
  const topIdx: number[] = [];
  const underPos: number[] = [];
  const underIdx: number[] = [];
  let topBase = 0;
  let underBase = 0;
  for (const face of faces) {
    const grid: Vector3[][] = [];
    for (let j = 0; j <= nv; j++) {
      const row: Vector3[] = [];
      const v = (j / nv) * vMax;
      for (let i = 0; i <= nu; i++) {
        const u = (i / nu) * 2 - 1;
        row.push(face(u, v));
      }
      grid.push(row);
    }
    // Arc-length UVs (metres) so tiles have a constant size.
    const vLen: number[] = [0];
    for (let j = 1; j <= nv; j++)
      vLen.push(vLen[j - 1]! + grid[j]![nu >> 1]!.distanceTo(grid[j - 1]![nu >> 1]!));
    for (let j = 0; j <= nv; j++) {
      let uAcc = 0;
      for (let i = 0; i <= nu; i++) {
        if (i > 0) uAcc += grid[j]![i]!.distanceTo(grid[j]![i - 1]!);
        const p = grid[j]![i]!;
        topPos.push(p.x, p.y, p.z);
        topUv.push(uAcc, vLen[j]!);
        underPos.push(p.x, p.y - t, p.z);
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = topBase + j * (nu + 1) + i;
        const b = a + 1;
        const c = a + (nu + 1);
        const d = c + 1;
        topIdx.push(a, b, c, b, d, c);
        const ua = underBase + j * (nu + 1) + i;
        underIdx.push(ua, ua + (nu + 1), ua + 1, ua + 1, ua + (nu + 1), ua + (nu + 2));
      }
    }
    // Fascia along the eave (v = 0): join top and underside rows.
    const fStart = underPos.length / 3;
    for (let i = 0; i <= nu; i++) {
      const p = grid[0]![i]!;
      underPos.push(p.x, p.y + 0.02, p.z, p.x, p.y - t, p.z);
    }
    for (let i = 0; i < nu; i++) {
      const a = fStart + i * 2;
      underIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    topBase += (nu + 1) * (nv + 1);
    underBase = underPos.length / 3;
  }
  const top = new BufferGeometry();
  top.setAttribute('position', new BufferAttribute(new Float32Array(topPos), 3));
  top.setAttribute('uv', new BufferAttribute(new Float32Array(topUv), 2));
  top.setIndex(topIdx);
  top.computeVertexNormals();
  const under = new BufferGeometry();
  under.setAttribute('position', new BufferAttribute(new Float32Array(underPos), 3));
  under.setIndex(underIdx);
  under.computeVertexNormals();
  return { top: top.toNonIndexed(), under: under.toNonIndexed() };
}

/**
 * Hip roof over a rectangle. `halfX`/`halfZ` include the overhang; the ridge runs along x.
 * Returns the tiled top surface, the painted underside and the ridge line end points.
 */
export function hipRoof(halfX: number, halfZ: number, o: RoofOptions) {
  const ridge = Math.max(halfX - halfZ, 0.001);
  const flare = o.flare ?? 0.07;
  const fl = (u: number, v: number) => 1 + flare * Math.pow(Math.abs(u), 4) * (1 - v);
  const faces: FaceFn[] = [
    // front (+z)
    (u, v) => {
      const hw = halfX + (ridge - halfX) * v;
      return new Vector3(u * hw * fl(u, v), surfaceY(u, v, o), halfZ * (1 - v) * fl(u, v));
    },
    // back (-z)
    (u, v) => {
      const hw = halfX + (ridge - halfX) * v;
      return new Vector3(-u * hw * fl(u, v), surfaceY(u, v, o), -halfZ * (1 - v) * fl(u, v));
    },
    // right (+x)
    (u, v) => {
      const hd = halfZ * (1 - v);
      return new Vector3(
        (halfX + (ridge - halfX) * v) * fl(u, v),
        surfaceY(u, v, o),
        -u * hd * fl(u, v),
      );
    },
    // left (-x)
    (u, v) => {
      const hd = halfZ * (1 - v);
      return new Vector3(
        -(halfX + (ridge - halfX) * v) * fl(u, v),
        surfaceY(u, v, o),
        u * hd * fl(u, v),
      );
    },
  ];
  const { top, under } = buildFaces(faces, o);
  const hips: Vector3[][] = [];
  for (const [sx, sz] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const) {
    const line: Vector3[] = [];
    for (let k = 0; k <= 8; k++) {
      const v = k / 8;
      const hw = halfX + (ridge - halfX) * v;
      line.push(
        new Vector3(sx * hw * fl(1, v), surfaceY(1, v, o) + 0.06, sz * halfZ * (1 - v) * fl(1, v)),
      );
    }
    hips.push(line);
  }
  return {
    top,
    under,
    ridgeFrom: new Vector3(-ridge, o.height + 0.06, 0),
    ridgeTo: new Vector3(ridge, o.height + 0.06, 0),
    hips,
  };
}

/**
 * Pyramidal / tiered roof over a regular polygon (square, hexagon, octagon...).
 * `radius` is the circumradius at the eaves. With `vMax < 1` it becomes the skirt roof
 * of a pagoda tier.
 */
export function polygonRoof(sides: number, radius: number, o: RoofOptions, rotation = 0) {
  const flare = o.flare ?? 0.07;
  const corners: Vector3[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2;
    corners.push(new Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  const faces: FaceFn[] = corners.map((c0, i) => {
    const c1 = corners[(i + 1) % sides]!;
    return (u: number, v: number) => {
      const t = (u + 1) / 2;
      // c1 → c0 keeps the winding counter-clockwise seen from above (normals up).
      const edge = new Vector3().lerpVectors(c1, c0, t);
      const p = edge.multiplyScalar(1 - v);
      const f = 1 + flare * Math.pow(Math.abs(u), 4) * (1 - v);
      return new Vector3(p.x * f, surfaceY(u, v, o), p.z * f);
    };
  });
  const { top, under } = buildFaces(faces, o);
  const vMax = o.vMax ?? 1;
  const hips: Vector3[][] = corners.map((c) => {
    const line: Vector3[] = [];
    for (let k = 0; k <= 8; k++) {
      const v = (k / 8) * vMax;
      const f = 1 + flare * (1 - v);
      line.push(new Vector3(c.x * (1 - v) * f, surfaceY(1, v, o) + 0.05, c.z * (1 - v) * f));
    }
    return line;
  });
  return {
    top,
    under,
    corners,
    hips,
    apexY: o.height,
    topRadius: radius * (1 - vMax),
    topY: surfaceY(0, vMax, o),
  };
}

/** Tube along a polyline (ridges, rails, hanging lantern strings). */
export function tubeAlong(points: Vector3[], radius: number, radial = 6): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  let side = new Vector3(0, 1, 0);
  const dir = new Vector3();
  points.forEach((p, i) => {
    dir
      .subVectors(points[Math.min(i + 1, points.length - 1)]!, points[Math.max(i - 1, 0)]!)
      .normalize();
    side = side.clone().addScaledVector(dir, -side.dot(dir));
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0).addScaledVector(dir, -dir.x);
    side.normalize();
    const up = new Vector3().crossVectors(dir, side).normalize();
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      pos.push(
        p.x + (side.x * Math.cos(a) + up.x * Math.sin(a)) * radius,
        p.y + (side.y * Math.cos(a) + up.y * Math.sin(a)) * radius,
        p.z + (side.z * Math.cos(a) + up.z * Math.sin(a)) * radius,
      );
    }
  });
  for (let i = 0; i < points.length - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * radial + k;
      const b = i * radial + ((k + 1) % radial);
      idx.push(a, a + radial, b, b, a + radial, b + radial);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function box(w: number, h: number, d: number): BufferGeometry {
  return new BoxGeometry(w, h, d);
}

/** Cylinder standing on y = 0. */
export function post(
  radius: number,
  height: number,
  radial = 10,
  topRadius = radius,
): BufferGeometry {
  const g = new CylinderGeometry(topRadius, radius, height, radial);
  g.translate(0, height / 2, 0);
  return g;
}
