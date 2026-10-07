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
  (sj_u: number, sj_v: number): Vector3;
}

function surfaceY(sj_u: number, sj_v: number, sj_o: RoofOptions): number {
  const sj_sag = sj_o.sag ?? 1.6;
  return (
    sj_o.height * Math.pow(sj_v, sj_sag) +
    sj_o.lift * Math.pow(Math.abs(sj_u), 3) * Math.pow(1 - sj_v, 2)
  );
}

/**
 * Builds top surface, underside and fascia for a set of faces. Each face maps
 * (u ∈ [-1, 1] along the eave, v ∈ [0, vMax] up the slope) to a point.
 * UVs are in metres (u along the eave, v up the slope) for the tile shader.
 */
function buildFaces(
  sj_faces: FaceFn[],
  sj_o: RoofOptions,
): { top: BufferGeometry; under: BufferGeometry } {
  const sj_nu = sj_o.segmentsU ?? 14;
  const sj_nv = sj_o.segmentsV ?? 8;
  const sj_vMax = sj_o.vMax ?? 1;
  const sj_t = sj_o.thickness ?? 0.12;
  const sj_topPos: number[] = [];
  const sj_topUv: number[] = [];
  const sj_topIdx: number[] = [];
  const sj_underPos: number[] = [];
  const sj_underIdx: number[] = [];
  let sj_topBase = 0;
  let sj_underBase = 0;
  for (const sj_face of sj_faces) {
    const sj_grid: Vector3[][] = [];
    for (let sj_j = 0; sj_j <= sj_nv; sj_j++) {
      const sj_row: Vector3[] = [];
      const sj_v = (sj_j / sj_nv) * sj_vMax;
      for (let sj_i = 0; sj_i <= sj_nu; sj_i++) {
        const sj_u = (sj_i / sj_nu) * 2 - 1;
        sj_row.push(sj_face(sj_u, sj_v));
      }
      sj_grid.push(sj_row);
    }
    // Arc-length UVs (metres) so tiles have a constant size.
    const sj_vLen: number[] = [0];
    for (let sj_j = 1; sj_j <= sj_nv; sj_j++)
      sj_vLen.push(
        sj_vLen[sj_j - 1]! +
          sj_grid[sj_j]![sj_nu >> 1]!.distanceTo(sj_grid[sj_j - 1]![sj_nu >> 1]!),
      );
    for (let sj_j = 0; sj_j <= sj_nv; sj_j++) {
      let sj_uAcc = 0;
      for (let sj_i = 0; sj_i <= sj_nu; sj_i++) {
        if (sj_i > 0) sj_uAcc += sj_grid[sj_j]![sj_i]!.distanceTo(sj_grid[sj_j]![sj_i - 1]!);
        const sj_p = sj_grid[sj_j]![sj_i]!;
        sj_topPos.push(sj_p.x, sj_p.y, sj_p.z);
        sj_topUv.push(sj_uAcc, sj_vLen[sj_j]!);
        sj_underPos.push(sj_p.x, sj_p.y - sj_t, sj_p.z);
      }
    }
    for (let sj_j = 0; sj_j < sj_nv; sj_j++) {
      for (let sj_i = 0; sj_i < sj_nu; sj_i++) {
        const sj_a = sj_topBase + sj_j * (sj_nu + 1) + sj_i;
        const sj_b = sj_a + 1;
        const sj_c = sj_a + (sj_nu + 1);
        const sj_d = sj_c + 1;
        sj_topIdx.push(sj_a, sj_b, sj_c, sj_b, sj_d, sj_c);
        const sj_ua = sj_underBase + sj_j * (sj_nu + 1) + sj_i;
        sj_underIdx.push(
          sj_ua,
          sj_ua + (sj_nu + 1),
          sj_ua + 1,
          sj_ua + 1,
          sj_ua + (sj_nu + 1),
          sj_ua + (sj_nu + 2),
        );
      }
    }
    // Fascia along the eave (v = 0): join top and underside rows.
    const sj_fStart = sj_underPos.length / 3;
    for (let sj_i = 0; sj_i <= sj_nu; sj_i++) {
      const sj_p = sj_grid[0]![sj_i]!;
      sj_underPos.push(sj_p.x, sj_p.y + 0.02, sj_p.z, sj_p.x, sj_p.y - sj_t, sj_p.z);
    }
    for (let sj_i = 0; sj_i < sj_nu; sj_i++) {
      const sj_a = sj_fStart + sj_i * 2;
      sj_underIdx.push(sj_a, sj_a + 1, sj_a + 2, sj_a + 1, sj_a + 3, sj_a + 2);
    }
    sj_topBase += (sj_nu + 1) * (sj_nv + 1);
    sj_underBase = sj_underPos.length / 3;
  }
  const sj_top = new BufferGeometry();
  sj_top.setAttribute('position', new BufferAttribute(new Float32Array(sj_topPos), 3));
  sj_top.setAttribute('uv', new BufferAttribute(new Float32Array(sj_topUv), 2));
  sj_top.setIndex(sj_topIdx);
  sj_top.computeVertexNormals();
  const sj_under = new BufferGeometry();
  sj_under.setAttribute('position', new BufferAttribute(new Float32Array(sj_underPos), 3));
  sj_under.setIndex(sj_underIdx);
  sj_under.computeVertexNormals();
  return { top: sj_top.toNonIndexed(), under: sj_under.toNonIndexed() };
}

/**
 * Hip roof over a rectangle. `sj_halfX`/`sj_halfZ` include the overhang; the ridge runs along x.
 * Returns the tiled top surface, the painted underside and the ridge line end points.
 */
export function hipRoof(sj_halfX: number, sj_halfZ: number, sj_o: RoofOptions) {
  const sj_ridge = Math.max(sj_halfX - sj_halfZ, 0.001);
  const sj_flare = sj_o.flare ?? 0.07;
  const sj_fl = (sj_u: number, sj_v: number) =>
    1 + sj_flare * Math.pow(Math.abs(sj_u), 4) * (1 - sj_v);
  const sj_faces: FaceFn[] = [
    // front (+z)
    (sj_u, sj_v) => {
      const sj_hw = sj_halfX + (sj_ridge - sj_halfX) * sj_v;
      return new Vector3(
        sj_u * sj_hw * sj_fl(sj_u, sj_v),
        surfaceY(sj_u, sj_v, sj_o),
        sj_halfZ * (1 - sj_v) * sj_fl(sj_u, sj_v),
      );
    },
    // back (-z)
    (sj_u, sj_v) => {
      const sj_hw = sj_halfX + (sj_ridge - sj_halfX) * sj_v;
      return new Vector3(
        -sj_u * sj_hw * sj_fl(sj_u, sj_v),
        surfaceY(sj_u, sj_v, sj_o),
        -sj_halfZ * (1 - sj_v) * sj_fl(sj_u, sj_v),
      );
    },
    // right (+x)
    (sj_u, sj_v) => {
      const sj_hd = sj_halfZ * (1 - sj_v);
      return new Vector3(
        (sj_halfX + (sj_ridge - sj_halfX) * sj_v) * sj_fl(sj_u, sj_v),
        surfaceY(sj_u, sj_v, sj_o),
        -sj_u * sj_hd * sj_fl(sj_u, sj_v),
      );
    },
    // left (-x)
    (sj_u, sj_v) => {
      const sj_hd = sj_halfZ * (1 - sj_v);
      return new Vector3(
        -(sj_halfX + (sj_ridge - sj_halfX) * sj_v) * sj_fl(sj_u, sj_v),
        surfaceY(sj_u, sj_v, sj_o),
        sj_u * sj_hd * sj_fl(sj_u, sj_v),
      );
    },
  ];
  const { top: sj_top, under: sj_under } = buildFaces(sj_faces, sj_o);
  const sj_hips: Vector3[][] = [];
  for (const [sj_sx, sj_sz] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const) {
    const sj_line: Vector3[] = [];
    for (let sj_k = 0; sj_k <= 8; sj_k++) {
      const sj_v = sj_k / 8;
      const sj_hw = sj_halfX + (sj_ridge - sj_halfX) * sj_v;
      sj_line.push(
        new Vector3(
          sj_sx * sj_hw * sj_fl(1, sj_v),
          surfaceY(1, sj_v, sj_o) + 0.06,
          sj_sz * sj_halfZ * (1 - sj_v) * sj_fl(1, sj_v),
        ),
      );
    }
    sj_hips.push(sj_line);
  }
  return {
    top: sj_top,
    under: sj_under,
    ridgeFrom: new Vector3(-sj_ridge, sj_o.height + 0.06, 0),
    ridgeTo: new Vector3(sj_ridge, sj_o.height + 0.06, 0),
    hips: sj_hips,
  };
}

/**
 * Pyramidal / tiered roof over a regular polygon (square, hexagon, octagon...).
 * `sj_radius` is the circumradius at the eaves. With `vMax < 1` it becomes the skirt roof
 * of a pagoda tier.
 */
export function polygonRoof(
  sj_sides: number,
  sj_radius: number,
  sj_o: RoofOptions,
  sj_rotation = 0,
) {
  const sj_flare = sj_o.flare ?? 0.07;
  const sj_corners: Vector3[] = [];
  for (let sj_i = 0; sj_i < sj_sides; sj_i++) {
    const sj_a = sj_rotation + (sj_i / sj_sides) * Math.PI * 2;
    sj_corners.push(new Vector3(Math.cos(sj_a) * sj_radius, 0, Math.sin(sj_a) * sj_radius));
  }
  const sj_faces: FaceFn[] = sj_corners.map((sj_c0, sj_i) => {
    const sj_c1 = sj_corners[(sj_i + 1) % sj_sides]!;
    return (sj_u: number, sj_v: number) => {
      const sj_t = (sj_u + 1) / 2;
      // c1 → c0 keeps the winding counter-clockwise seen from above (normals up).
      const sj_edge = new Vector3().lerpVectors(sj_c1, sj_c0, sj_t);
      const sj_p = sj_edge.multiplyScalar(1 - sj_v);
      const sj_f = 1 + sj_flare * Math.pow(Math.abs(sj_u), 4) * (1 - sj_v);
      return new Vector3(sj_p.x * sj_f, surfaceY(sj_u, sj_v, sj_o), sj_p.z * sj_f);
    };
  });
  const { top: sj_top, under: sj_under } = buildFaces(sj_faces, sj_o);
  const sj_vMax = sj_o.vMax ?? 1;
  const sj_hips: Vector3[][] = sj_corners.map((sj_c) => {
    const sj_line: Vector3[] = [];
    for (let sj_k = 0; sj_k <= 8; sj_k++) {
      const sj_v = (sj_k / 8) * sj_vMax;
      const sj_f = 1 + sj_flare * (1 - sj_v);
      sj_line.push(
        new Vector3(
          sj_c.x * (1 - sj_v) * sj_f,
          surfaceY(1, sj_v, sj_o) + 0.05,
          sj_c.z * (1 - sj_v) * sj_f,
        ),
      );
    }
    return sj_line;
  });
  return {
    top: sj_top,
    under: sj_under,
    corners: sj_corners,
    hips: sj_hips,
    apexY: sj_o.height,
    topRadius: sj_radius * (1 - sj_vMax),
    topY: surfaceY(0, sj_vMax, sj_o),
  };
}

/** Tube along a polyline (ridges, rails, hanging lantern strings). */
export function tubeAlong(sj_points: Vector3[], sj_radius: number, sj_radial = 6): BufferGeometry {
  const sj_pos: number[] = [];
  const sj_idx: number[] = [];
  let sj_side = new Vector3(0, 1, 0);
  const sj_dir = new Vector3();
  sj_points.forEach((sj_p, sj_i) => {
    sj_dir
      .subVectors(
        sj_points[Math.min(sj_i + 1, sj_points.length - 1)]!,
        sj_points[Math.max(sj_i - 1, 0)]!,
      )
      .normalize();
    sj_side = sj_side.clone().addScaledVector(sj_dir, -sj_side.dot(sj_dir));
    if (sj_side.lengthSq() < 1e-6) sj_side.set(1, 0, 0).addScaledVector(sj_dir, -sj_dir.x);
    sj_side.normalize();
    const sj_up = new Vector3().crossVectors(sj_dir, sj_side).normalize();
    for (let sj_k = 0; sj_k < sj_radial; sj_k++) {
      const sj_a = (sj_k / sj_radial) * Math.PI * 2;
      sj_pos.push(
        sj_p.x + (sj_side.x * Math.cos(sj_a) + sj_up.x * Math.sin(sj_a)) * sj_radius,
        sj_p.y + (sj_side.y * Math.cos(sj_a) + sj_up.y * Math.sin(sj_a)) * sj_radius,
        sj_p.z + (sj_side.z * Math.cos(sj_a) + sj_up.z * Math.sin(sj_a)) * sj_radius,
      );
    }
  });
  for (let sj_i = 0; sj_i < sj_points.length - 1; sj_i++) {
    for (let sj_k = 0; sj_k < sj_radial; sj_k++) {
      const sj_a = sj_i * sj_radial + sj_k;
      const sj_b = sj_i * sj_radial + ((sj_k + 1) % sj_radial);
      sj_idx.push(sj_a, sj_a + sj_radial, sj_b, sj_b, sj_a + sj_radial, sj_b + sj_radial);
    }
  }
  const sj_g = new BufferGeometry();
  sj_g.setAttribute('position', new BufferAttribute(new Float32Array(sj_pos), 3));
  sj_g.setIndex(sj_idx);
  sj_g.computeVertexNormals();
  return sj_g;
}

export function box(sj_w: number, sj_h: number, sj_d: number): BufferGeometry {
  return new BoxGeometry(sj_w, sj_h, sj_d);
}

/** Cylinder standing on y = 0. */
export function post(
  sj_radius: number,
  sj_height: number,
  sj_radial = 10,
  sj_topRadius = sj_radius,
): BufferGeometry {
  const sj_g = new CylinderGeometry(sj_topRadius, sj_radius, sj_height, sj_radial);
  sj_g.translate(0, sj_height / 2, 0);
  return sj_g;
}
