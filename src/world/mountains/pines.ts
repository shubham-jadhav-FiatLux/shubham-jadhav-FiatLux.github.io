/**
 * Small pines for the mountain tops, like the ones clinging to the peaks of Huangshan in
 * ink paintings: a crooked trunk leaning out over the drop and flat, layered pads of
 * needles. Plain vertex arrays (no three.js); merged into the mountain meshes.
 */
import { Random } from '../../utils/random';
import type { PeakMesh } from './peaks';

/** One squashed, slightly irregular ellipsoid pad, as a ring-and-poles mesh. */
function pad(
  sj_out: Builder,
  sj_cx: number,
  sj_cy: number,
  sj_cz: number,
  sj_rx: number,
  sj_ry: number,
  sj_rz: number,
  sj_rand: Random,
): void {
  const sj_around = 7;
  const sj_start = sj_out.count;
  const sj_rot = sj_rand.range(0, Math.PI * 2);
  sj_out.vertex(sj_cx, sj_cy + sj_ry, sj_cz);
  // upper ring, equator, lower ring
  const sj_rings = [
    { y: 0.55, r: 0.72 },
    { y: 0, r: 1 },
    { y: -0.6, r: 0.62 },
  ];
  for (const sj_ring of sj_rings) {
    for (let sj_j = 0; sj_j < sj_around; sj_j++) {
      const sj_a = sj_rot + (sj_j / sj_around) * Math.PI * 2;
      const sj_wobble = 1 + sj_rand.spread(0.18);
      sj_out.vertex(
        sj_cx + Math.cos(sj_a) * sj_rx * sj_ring.r * sj_wobble,
        sj_cy + sj_ring.y * sj_ry,
        sj_cz + Math.sin(sj_a) * sj_rz * sj_ring.r * sj_wobble,
      );
    }
  }
  sj_out.vertex(sj_cx, sj_cy - sj_ry * 0.85, sj_cz);
  const sj_top = sj_start;
  const sj_bottom = sj_start + 1 + sj_around * 3;
  const sj_ringStart = (sj_k: number) => sj_start + 1 + sj_k * sj_around;
  for (let sj_j = 0; sj_j < sj_around; sj_j++) {
    const sj_j1 = (sj_j + 1) % sj_around;
    sj_out.tri(sj_top, sj_ringStart(0) + sj_j1, sj_ringStart(0) + sj_j);
    for (let sj_k = 0; sj_k < 2; sj_k++) {
      const sj_a = sj_ringStart(sj_k) + sj_j;
      const sj_b = sj_ringStart(sj_k) + sj_j1;
      const sj_c = sj_ringStart(sj_k + 1) + sj_j;
      const sj_d = sj_ringStart(sj_k + 1) + sj_j1;
      sj_out.tri(sj_a, sj_b, sj_c);
      sj_out.tri(sj_b, sj_d, sj_c);
    }
    sj_out.tri(sj_bottom, sj_ringStart(2) + sj_j, sj_ringStart(2) + sj_j1);
  }
}

/** A tapered five-sided limb from a to b. */
function limb(
  sj_out: Builder,
  sj_ax: number,
  sj_ay: number,
  sj_az: number,
  sj_bx: number,
  sj_by: number,
  sj_bz: number,
  sj_r0: number,
  sj_r1: number,
): void {
  const sj_sides = 5;
  const sj_dx = sj_bx - sj_ax;
  const sj_dy = sj_by - sj_ay;
  const sj_dz = sj_bz - sj_az;
  const sj_len = Math.hypot(sj_dx, sj_dy, sj_dz) || 1;
  // a frame around the limb's axis
  const sj_ux = sj_dx / sj_len;
  const sj_uy = sj_dy / sj_len;
  const sj_uz = sj_dz / sj_len;
  let sj_px = -sj_uz;
  const sj_py = 0;
  let sj_pz = sj_ux;
  const sj_pl = Math.hypot(sj_px, sj_py, sj_pz);
  if (sj_pl < 1e-4) {
    sj_px = 1;
    sj_pz = 0;
  } else {
    sj_px /= sj_pl;
    sj_pz /= sj_pl;
  }
  // q = u x p
  const sj_qx = sj_uy * sj_pz - sj_uz * sj_py;
  const sj_qy = sj_uz * sj_px - sj_ux * sj_pz;
  const sj_qz = sj_ux * sj_py - sj_uy * sj_px;
  const sj_start = sj_out.count;
  for (let sj_end = 0; sj_end < 2; sj_end++) {
    const sj_r = sj_end ? sj_r1 : sj_r0;
    const sj_cx = sj_end ? sj_bx : sj_ax;
    const sj_cy = sj_end ? sj_by : sj_ay;
    const sj_cz = sj_end ? sj_bz : sj_az;
    for (let sj_j = 0; sj_j < sj_sides; sj_j++) {
      const sj_a = (sj_j / sj_sides) * Math.PI * 2;
      const sj_c = Math.cos(sj_a) * sj_r;
      const sj_s = Math.sin(sj_a) * sj_r;
      sj_out.vertex(
        sj_cx + sj_px * sj_c + sj_qx * sj_s,
        sj_cy + sj_py * sj_c + sj_qy * sj_s,
        sj_cz + sj_pz * sj_c + sj_qz * sj_s,
      );
    }
  }
  for (let sj_j = 0; sj_j < sj_sides; sj_j++) {
    const sj_j1 = (sj_j + 1) % sj_sides;
    sj_out.tri(sj_start + sj_j, sj_start + sj_j1, sj_start + sj_sides + sj_j);
    sj_out.tri(sj_start + sj_j1, sj_start + sj_sides + sj_j1, sj_start + sj_sides + sj_j);
  }
}

/** An open cone (no base), apex up. */
function cone(
  sj_out: Builder,
  sj_cx: number,
  sj_cy: number,
  sj_cz: number,
  sj_radius: number,
  sj_height: number,
  sj_rand: Random,
): void {
  const sj_sides = 6;
  const sj_start = sj_out.count;
  const sj_rot = sj_rand.range(0, Math.PI * 2);
  for (let sj_j = 0; sj_j < sj_sides; sj_j++) {
    const sj_a = sj_rot + (sj_j / sj_sides) * Math.PI * 2;
    const sj_r = sj_radius * (1 + sj_rand.spread(0.12));
    sj_out.vertex(sj_cx + Math.cos(sj_a) * sj_r, sj_cy, sj_cz + Math.sin(sj_a) * sj_r);
  }
  sj_out.vertex(sj_cx, sj_cy + sj_height, sj_cz);
  for (let sj_j = 0; sj_j < sj_sides; sj_j++) {
    sj_out.tri(sj_start + sj_j, sj_start + sj_sides, sj_start + ((sj_j + 1) % sj_sides));
  }
}

class Builder {
  positions: number[] = [];
  indices: number[] = [];
  get count(): number {
    return this.positions.length / 3;
  }
  vertex(sj_x: number, sj_y: number, sj_z: number): void {
    this.positions.push(sj_x, sj_y, sj_z);
  }
  tri(sj_a: number, sj_b: number, sj_c: number): void {
    this.indices.push(sj_a, sj_b, sj_c);
  }
}

/**
 * A pine rooted at (x, y, z), `sj_height` metres tall, leaning out along (ox, oz) by up to
 * `sj_reach` (0 = upright, 1 = growing almost sideways out of a cliff).
 */
export function buildPine(
  sj_x: number,
  sj_y: number,
  sj_z: number,
  sj_height: number,
  sj_ox: number,
  sj_oz: number,
  sj_reach: number,
  sj_seed: number,
): PeakMesh {
  const sj_rand = new Random(sj_seed);
  const sj_out = new Builder();
  const sj_lean = sj_reach * sj_rand.range(0.5, 1);
  // trunk: out over the drop, then turning up
  const sj_midX = sj_x + sj_ox * sj_height * 0.32 * sj_lean;
  const sj_midZ = sj_z + sj_oz * sj_height * 0.32 * sj_lean;
  const sj_midY = sj_y + sj_height * (0.34 - 0.12 * sj_lean);
  const sj_topX = sj_midX + sj_ox * sj_height * 0.22 * sj_lean + sj_rand.spread(0.08) * sj_height;
  const sj_topZ = sj_midZ + sj_oz * sj_height * 0.22 * sj_lean + sj_rand.spread(0.08) * sj_height;
  const sj_topY = sj_y + sj_height * (0.78 - 0.18 * sj_lean);
  const sj_thick = sj_height * 0.045;
  limb(
    sj_out,
    sj_x,
    sj_y - sj_height * 0.1,
    sj_z,
    sj_midX,
    sj_midY,
    sj_midZ,
    sj_thick,
    sj_thick * 0.75,
  );
  limb(
    sj_out,
    sj_midX,
    sj_midY,
    sj_midZ,
    sj_topX,
    sj_topY,
    sj_topZ,
    sj_thick * 0.75,
    sj_thick * 0.4,
  );
  // pads: a big flat crown and two or three tiers below it, offset like branches
  const sj_tiers = sj_rand.int(3, 4);
  const sj_crown = sj_height * sj_rand.range(0.27, 0.35);
  pad(
    sj_out,
    sj_topX,
    sj_topY,
    sj_topZ,
    sj_crown,
    sj_crown * 0.4,
    sj_crown * sj_rand.range(0.75, 1),
    sj_rand,
  );
  for (let sj_k = 0; sj_k < sj_tiers; sj_k++) {
    const sj_f = (sj_k + 1) / (sj_tiers + 1);
    const sj_along = 1 - sj_f * 0.75;
    const sj_bx = sj_midX + (sj_topX - sj_midX) * sj_along;
    const sj_by = sj_midY + (sj_topY - sj_midY) * sj_along - sj_f * sj_height * 0.12;
    const sj_bz = sj_midZ + (sj_topZ - sj_midZ) * sj_along;
    const sj_side = sj_rand.range(0, Math.PI * 2);
    const sj_reachOut = sj_height * sj_rand.range(0.18, 0.32);
    const sj_px = sj_bx + Math.cos(sj_side) * sj_reachOut + sj_ox * sj_height * 0.12;
    const sj_pz = sj_bz + Math.sin(sj_side) * sj_reachOut + sj_oz * sj_height * 0.12;
    const sj_r = sj_crown * sj_rand.range(0.6, 0.85);
    pad(sj_out, sj_px, sj_by, sj_pz, sj_r, sj_r * 0.4, sj_r * sj_rand.range(0.7, 1), sj_rand);
  }
  return finish(sj_out);
}

/**
 * A clump of scrub: a rounded lump of foliage half sunk into the rock. Hundreds of them
 * give the crowns and ledges of the peaks their wooded, broken outline.
 */
export function buildShrub(
  sj_x: number,
  sj_y: number,
  sj_z: number,
  sj_radius: number,
  sj_ox: number,
  sj_oz: number,
  sj_seed: number,
): PeakMesh {
  const sj_rand = new Random(sj_seed);
  const sj_out = new Builder();
  const sj_around = 6;
  const sj_cx = sj_x + sj_ox * sj_radius * 0.35;
  const sj_cz = sj_z + sj_oz * sj_radius * 0.35;
  const sj_cy = sj_y + sj_radius * 0.1;
  const sj_rot = sj_rand.range(0, Math.PI * 2);
  const sj_tall = sj_rand.range(0.65, 0.95);
  sj_out.vertex(sj_cx, sj_cy + sj_radius * sj_tall, sj_cz);
  const sj_rings = [
    { y: 0.5 * sj_tall, r: 0.72 },
    { y: 0, r: 1 },
  ];
  for (const sj_ring of sj_rings) {
    for (let sj_j = 0; sj_j < sj_around; sj_j++) {
      const sj_a = sj_rot + ((sj_j + (sj_ring.y > 0 ? 0.5 : 0)) / sj_around) * Math.PI * 2;
      const sj_r = sj_radius * sj_ring.r * (1 + sj_rand.spread(0.2));
      sj_out.vertex(
        sj_cx + Math.cos(sj_a) * sj_r,
        sj_cy + sj_ring.y * sj_radius + sj_rand.spread(0.1) * sj_radius,
        sj_cz + Math.sin(sj_a) * sj_r,
      );
    }
  }
  sj_out.vertex(sj_cx, sj_cy - sj_radius * 0.7, sj_cz);
  // Shade the clump mostly like the face it grows on, so scrub reads as part of the
  // mountain's mass instead of as separate lit spots.
  const sj_ol = Math.hypot(sj_ox, 0.5, sj_oz);
  const sj_fx = sj_ox / sj_ol;
  const sj_fy = 0.5 / sj_ol;
  const sj_fz = sj_oz / sj_ol;
  const sj_normals: number[] = [];
  for (let sj_v = 0; sj_v < sj_out.count; sj_v++) {
    let sj_nx = sj_out.positions[sj_v * 3]! - sj_cx;
    let sj_ny = sj_out.positions[sj_v * 3 + 1]! - sj_cy;
    let sj_nz = sj_out.positions[sj_v * 3 + 2]! - sj_cz;
    const sj_l = Math.hypot(sj_nx, sj_ny, sj_nz) || 1;
    sj_nx = (sj_nx / sj_l) * 0.4 + sj_fx * 0.6;
    sj_ny = (sj_ny / sj_l) * 0.4 + sj_fy * 0.6;
    sj_nz = (sj_nz / sj_l) * 0.4 + sj_fz * 0.6;
    const sj_m = Math.hypot(sj_nx, sj_ny, sj_nz) || 1;
    sj_normals.push(sj_nx / sj_m, sj_ny / sj_m, sj_nz / sj_m);
  }
  const sj_ring0 = 1;
  const sj_ring1 = 1 + sj_around;
  const sj_bottom = 1 + sj_around * 2;
  for (let sj_j = 0; sj_j < sj_around; sj_j++) {
    const sj_j1 = (sj_j + 1) % sj_around;
    sj_out.tri(0, sj_ring0 + sj_j1, sj_ring0 + sj_j);
    // the upper ring is offset by half a step: stitch it to the equator with a zig-zag
    sj_out.tri(sj_ring0 + sj_j, sj_ring0 + sj_j1, sj_ring1 + sj_j1);
    sj_out.tri(sj_ring0 + sj_j, sj_ring1 + sj_j1, sj_ring1 + sj_j);
    sj_out.tri(sj_bottom, sj_ring1 + sj_j, sj_ring1 + sj_j1);
  }
  return { ...finish(sj_out), normals: new Float32Array(sj_normals) };
}

/** A plain conifer of stacked cones, for the forested foothills. */
export function buildConifer(
  sj_x: number,
  sj_y: number,
  sj_z: number,
  sj_height: number,
  sj_seed: number,
) {
  const sj_rand = new Random(sj_seed);
  const sj_out = new Builder();
  const sj_tiers = 3;
  const sj_width = sj_height * sj_rand.range(0.22, 0.3);
  for (let sj_k = 0; sj_k < sj_tiers; sj_k++) {
    const sj_f = sj_k / sj_tiers;
    const sj_r = sj_width * (1 - sj_f * 0.45);
    const sj_bottom = sj_y + sj_height * (0.12 + sj_f * 0.27);
    cone(sj_out, sj_x, sj_bottom, sj_z, sj_r, sj_height * (0.5 - sj_f * 0.08), sj_rand);
  }
  return finish(sj_out);
}

function finish(sj_out: Builder): PeakMesh {
  const sj_positions = new Float32Array(sj_out.positions);
  const sj_info = new Float32Array(sj_out.count * 3);
  for (let sj_i = 0; sj_i < sj_out.count; sj_i++) {
    sj_info[sj_i * 3] = 0;
    sj_info[sj_i * 3 + 1] = 1;
    // > 1: always vegetation, never rock
    sj_info[sj_i * 3 + 2] = 2;
  }
  return { positions: sj_positions, info: sj_info, indices: new Uint32Array(sj_out.indices) };
}
