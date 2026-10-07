import {
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Matrix4,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mul, T, type ArchBuilder } from './Builder';
import { box, post, tubeAlong } from './geometry';
import {
  addBeam,
  addFinial,
  addHipRoof,
  addLantern,
  addPillar,
  addPolygonRoof,
  addStoneLantern,
  sj_PAL,
} from './parts';
import { createSignboardTexture } from './textures';
import type { CollisionWorld } from '../../physics/CollisionWorld';
import type { HouseDef } from '../layout';
import { sj_WATER_LEVEL } from '../layout';
import { Random } from '../../utils/random';

export interface Placed {
  x: number;
  y: number;
  z: number;
  /** rotation around Y (front faces local +z) */
  rot: number;
}

const sj_toWorld = (sj_p: Placed, sj_lx: number, sj_lz: number) => {
  const sj_c = Math.cos(sj_p.rot);
  const sj_s = Math.sin(sj_p.rot);
  return { x: sj_p.x + sj_lx * sj_c + sj_lz * sj_s, z: sj_p.z - sj_lx * sj_s + sj_lz * sj_c };
};

/* ------------------------------------------------------------------ Gate */

/** Ceremonial paifang gate with a gilded signboard. Returns the signboard mesh. */
export function buildGate(
  sj_b: ArchBuilder,
  sj_col: CollisionWorld,
  sj_p: Placed,
  sj_glyphs: string,
): Mesh {
  const sj_m = T(sj_p.x, sj_p.y, sj_p.z, 0, sj_p.rot);
  const sj_inner = 1.95;
  const sj_outer = 4.7;
  for (const sj_sx of [-1, 1]) {
    addPillar(sj_b, mul(sj_m, T(sj_sx * sj_inner, 0, 0)), 0.24, 5.0);
    addPillar(sj_b, mul(sj_m, T(sj_sx * sj_outer, 0, 0)), 0.2, 3.8);
    // clamping stones either side of each pillar
    for (const sj_x of [sj_inner, sj_outer]) {
      sj_b.add(
        'paint',
        box(0.62, 0.9, 1.1).translate(0, 0.45, 0),
        sj_PAL.stoneDark,
        mul(sj_m, T(sj_sx * sj_x, 0, 0)),
      );
      const sj_w = sj_toWorld(sj_p, sj_sx * sj_x, 0);
      sj_col.box(sj_w.x, sj_w.z, 0.32, 0.56, sj_p.rot, sj_p.y - 1, sj_p.y + 6, 'gate');
    }
    // side spans
    addBeam(sj_b, mul(sj_m, T(sj_sx * 3.32, 3.15, 0)), 2.9, 0.26);
    addBeam(sj_b, mul(sj_m, T(sj_sx * 3.32, 3.7, 0)), 2.9, 0.22);
    addHipRoof(
      sj_b,
      mul(sj_m, T(sj_sx * 3.32, 4.02, 0)),
      1.85,
      0.95,
      { height: 0.72, lift: 0.3, thickness: 0.1 },
      {
        tile: sj_PAL.tileTeal,
        ridge: '#245c54',
        under: sj_PAL.underside,
      },
    );
    // brackets under the eaves
    for (let sj_k = -2; sj_k <= 2; sj_k++) {
      sj_b.add(
        'paint',
        box(0.18, 0.16, 0.5),
        sj_PAL.gold,
        mul(sj_m, T(sj_sx * 3.32 + sj_k * 0.5, 3.93, 0)),
      );
    }
    // hanging lanterns
    addLantern(sj_b, mul(sj_m, T(sj_sx * 1.1, 3.35, 0.12)), 0.26);
    sj_b.add('paint', post(0.012, 0.55, 4), '#2a1a12', mul(sj_m, T(sj_sx * 1.1, 3.62, 0.12)));
  }
  addBeam(sj_b, mul(sj_m, T(0, 4.02, 0)), 4.5, 0.3, 0.26);
  addBeam(sj_b, mul(sj_m, T(0, 5.05, 0)), 4.8, 0.3, 0.28);
  for (let sj_k = -4; sj_k <= 4; sj_k++)
    sj_b.add('paint', box(0.18, 0.18, 0.56), sj_PAL.gold, mul(sj_m, T(sj_k * 0.5, 5.27, 0)));
  addHipRoof(
    sj_b,
    mul(sj_m, T(0, 5.36, 0)),
    3.05,
    1.1,
    { height: 0.9, lift: 0.4, thickness: 0.12 },
    {
      tile: sj_PAL.tileTeal,
      ridge: '#245c54',
      under: sj_PAL.underside,
    },
  );
  // stone lanterns guarding the entrance
  for (const sj_sx of [-1, 1]) addStoneLantern(sj_b, mul(sj_m, T(sj_sx * 6.4, 0, 1.6)), 1.1);
  for (const sj_sx of [-1, 1]) {
    const sj_w = sj_toWorld(sj_p, sj_sx * 6.4, 1.6);
    sj_col.circle(sj_w.x, sj_w.z, 0.45, sj_p.y - 1, sj_p.y + 2, 'lantern');
  }

  // Signboard (its own mesh: unique texture).
  const sj_board = new Mesh(
    new PlaneGeometry(2.35, 0.98),
    new MeshStandardMaterial({
      map: createSignboardTexture(sj_glyphs),
      roughness: 0.45,
      metalness: 0.1,
    }),
  );
  sj_board.position.set(0, 4.54, 0.2);
  const sj_frame = new Mesh(
    new BoxGeometry(2.5, 1.12, 0.12),
    new MeshStandardMaterial({ color: sj_PAL.gold, roughness: 0.4 }),
  );
  sj_frame.position.set(0, 4.54, 0.12);
  const sj_back = sj_board.clone();
  sj_back.rotation.y = Math.PI;
  sj_back.position.z = 0.04;
  const sj_group = new Mesh();
  sj_group.add(sj_frame, sj_board, sj_back);
  sj_group.position.set(sj_p.x, sj_p.y, sj_p.z);
  sj_group.rotation.y = sj_p.rot;
  sj_group.traverse((sj_o) => {
    sj_o.castShadow = true;
    sj_o.receiveShadow = true;
  });
  sj_group.name = 'gate-signboard';
  return sj_group;
}

/* ---------------------------------------------------------------- Pagoda */

export interface PagodaInfo {
  height: number;
  door: { x: number; z: number };
}

/** Five-tier octagonal pagoda with wind bells and a gilded spire. */
export function buildPagoda(sj_b: ArchBuilder, sj_col: CollisionWorld, sj_p: Placed): PagodaInfo {
  const sj_m = T(sj_p.x, sj_p.y, sj_p.z, 0, sj_p.rot);
  const sj_sides = 8;
  const sj_rot = Math.PI / 8; // flat face towards +z
  // stepped octagonal base
  sj_b.add(
    'paint',
    new CylinderGeometry(6.4, 6.7, 1.2, sj_sides).translate(0, -0.15, 0).rotateY(sj_rot),
    sj_PAL.stoneDark,
    sj_m,
  );
  sj_b.add(
    'paint',
    new CylinderGeometry(5.5, 5.6, 0.45, sj_sides).translate(0, 0.62, 0).rotateY(sj_rot),
    sj_PAL.stone,
    sj_m,
  );
  sj_col.addPlatform({
    shape: { type: 'circle', x: sj_p.x, z: sj_p.z, r: 6.2 },
    top: sj_p.y + 0.45,
    bottom: sj_p.y - 2,
    surface: 'stone',
  });
  sj_col.addPlatform({
    shape: { type: 'circle', x: sj_p.x, z: sj_p.z, r: 5.3 },
    top: sj_p.y + 0.85,
    bottom: sj_p.y - 2,
    surface: 'stone',
  });

  let sj_y = 0.85;
  let sj_r = 3.3;
  let sj_h = 3.4;
  const sj_tiers = 5;
  for (let sj_i = 0; sj_i < sj_tiers; sj_i++) {
    const sj_tm = mul(sj_m, T(0, sj_y, 0));
    // body walls and corner pillars
    sj_b.add(
      'paint',
      new CylinderGeometry(sj_r * 0.97, sj_r, sj_h, sj_sides)
        .translate(0, sj_h / 2, 0)
        .rotateY(sj_rot),
      '#ecdcc2',
      sj_tm,
    );
    for (let sj_k = 0; sj_k < sj_sides; sj_k++) {
      const sj_a = sj_rot + (sj_k / sj_sides) * Math.PI * 2 + Math.PI / sj_sides;
      const sj_cx = Math.cos(sj_a) * sj_r * 1.0;
      const sj_cz = Math.sin(sj_a) * sj_r * 1.0;
      sj_b.add('paint', post(0.13, sj_h, 6), sj_PAL.vermilion, mul(sj_tm, T(sj_cx, 0, sj_cz)));
    }
    // a window (or the door) on each face
    for (let sj_k = 0; sj_k < sj_sides; sj_k++) {
      const sj_fa = (sj_k / sj_sides) * Math.PI * 2;
      const sj_apothem = sj_r * Math.cos(Math.PI / sj_sides) + 0.02;
      const sj_wx = Math.sin(sj_fa) * sj_apothem;
      const sj_wz = Math.cos(sj_fa) * sj_apothem;
      const sj_isDoor = sj_i === 0 && sj_k === 0;
      const sj_ww = sj_isDoor ? 1.4 : 0.9 - sj_i * 0.06;
      const sj_wh = sj_isDoor ? 2.3 : 1.15 - sj_i * 0.08;
      const sj_wy = sj_isDoor ? 1.15 : sj_h * 0.55;
      if (sj_isDoor) {
        sj_b.add(
          'paint',
          box(sj_ww, sj_wh, 0.08),
          '#4a2a1b',
          mul(sj_tm, T(sj_wx, sj_wy, sj_wz, 0, sj_fa)),
        );
        sj_b.add(
          'paint',
          box(sj_ww + 0.25, 0.18, 0.12),
          sj_PAL.vermilion,
          mul(sj_tm, T(sj_wx, sj_wy + sj_wh / 2 + 0.05, sj_wz, 0, sj_fa)),
        );
        sj_b.add(
          'paint',
          new SphereGeometry(0.05, 6, 4),
          sj_PAL.gold,
          mul(sj_tm, T(sj_wx + Math.cos(sj_fa) * 0.12, sj_wy, sj_wz - Math.sin(sj_fa) * 0.12)),
        );
      } else {
        sj_b.add(
          'lattice',
          new PlaneGeometry(sj_ww, sj_wh),
          '#ffffff',
          mul(sj_tm, T(sj_wx, sj_wy, sj_wz, 0, sj_fa)),
        );
        sj_b.add(
          'paint',
          box(sj_ww + 0.16, 0.1, 0.1),
          sj_PAL.vermilion,
          mul(sj_tm, T(sj_wx, sj_wy + sj_wh / 2 + 0.04, sj_wz, 0, sj_fa)),
        );
        sj_b.add(
          'paint',
          box(sj_ww + 0.16, 0.1, 0.1),
          sj_PAL.vermilion,
          mul(sj_tm, T(sj_wx, sj_wy - sj_wh / 2 - 0.04, sj_wz, 0, sj_fa)),
        );
      }
    }
    // beam ring and bracket row
    sj_b.add(
      'paint',
      new CylinderGeometry(sj_r * 1.04, sj_r * 1.04, 0.28, sj_sides)
        .translate(0, sj_h - 0.1, 0)
        .rotateY(sj_rot),
      sj_PAL.beamTeal,
      sj_tm,
    );
    sj_b.add(
      'paint',
      new CylinderGeometry(sj_r * 1.1, sj_r * 1.04, 0.22, sj_sides)
        .translate(0, sj_h + 0.12, 0)
        .rotateY(sj_rot),
      sj_PAL.gold,
      sj_tm,
    );
    const sj_last = sj_i === sj_tiers - 1;
    const sj_overhang = 1.5 - sj_i * 0.14;
    const sj_roof = addPolygonRoof(
      sj_b,
      mul(sj_tm, T(0, sj_h + 0.2, 0)),
      sj_sides,
      (sj_r + sj_overhang) / Math.cos(Math.PI / sj_sides),
      sj_last
        ? { height: 2.6, lift: 0.55, thickness: 0.14 }
        : { height: 1.9 - sj_i * 0.12, lift: 0.5 - sj_i * 0.03, thickness: 0.14, vMax: 0.55 },
      { tile: sj_PAL.tileTeal, ridge: '#1f5a50', under: sj_PAL.underside },
      sj_rot + Math.PI / sj_sides,
    );
    // wind bells hanging from each corner
    for (const sj_c of sj_roof.corners) {
      const sj_bm = mul(sj_tm, T(sj_c.x, sj_h + 0.2 + sj_c.y - 0.28, sj_c.z));
      sj_b.add('paint', post(0.01, 0.18, 4), '#3a2a1c', mul(sj_bm, T(0, 0.02, 0)));
      sj_b.add(
        'paint',
        new CylinderGeometry(0.035, 0.1, 0.18, 8).translate(0, -0.08, 0),
        sj_PAL.gold,
        sj_bm,
      );
      if (sj_i === 0) addLantern(sj_b, mul(sj_bm, T(0, -0.55, 0)), 0.22);
    }
    if (sj_last) {
      addFinial(sj_b, mul(sj_tm, T(0, sj_h + 0.2 + sj_roof.topY - 0.1, 0)), 3.2);
      sj_y += sj_h + 0.2 + sj_roof.topY + 3.2;
    } else {
      sj_y += sj_h + 0.2 + sj_roof.topY - 0.25;
      sj_r *= 0.84;
      sj_h *= 0.86;
    }
  }
  sj_col.circle(sj_p.x, sj_p.z, 3.35, sj_p.y, sj_p.y + 30, 'pagoda');
  // stone lanterns at the front corners of the base
  for (const sj_sx of [-1, 1]) {
    addStoneLantern(sj_b, mul(sj_m, T(sj_sx * 4.2, 0.85, 3.6)), 0.9);
    const sj_w = sj_toWorld(sj_p, sj_sx * 4.2, 3.6);
    sj_col.circle(sj_w.x, sj_w.z, 0.4, sj_p.y, sj_p.y + 3, 'lantern');
  }
  const sj_door = sj_toWorld(sj_p, 0, 3.6);
  return { height: sj_y, door: sj_door };
}

/* -------------------------------------------------------------- Pavilion */

/**
 * Hexagonal tea pavilion on a stone platform over the water. Returns the table and the
 * shore-side entrance (the middle of the opening, and the way out).
 */
export function buildPavilion(
  sj_b: ArchBuilder,
  sj_col: CollisionWorld,
  sj_p: Placed,
): {
  table: { x: number; y: number; z: number };
  entrance: { x: number; z: number; nx: number; nz: number };
} {
  const sj_deck = sj_WATER_LEVEL + 0.62;
  const sj_m = T(sj_p.x, sj_deck, sj_p.z, 0, sj_p.rot);
  const sj_sides = 6;
  const sj_pr = 3.9;
  sj_b.add(
    'paint',
    new CylinderGeometry(sj_pr, sj_pr + 0.25, 2.6, sj_sides).translate(0, -1.3, 0),
    sj_PAL.stone,
    sj_m,
  );
  sj_b.add(
    'paint',
    new CylinderGeometry(sj_pr + 0.06, sj_pr + 0.06, 0.12, sj_sides).translate(0, -0.05, 0),
    sj_PAL.stoneDark,
    sj_m,
  );
  sj_col.addPlatform({
    shape: { type: 'circle', x: sj_p.x, z: sj_p.z, r: sj_pr - 0.1 },
    top: sj_deck,
    bottom: sj_deck - 3,
    surface: 'stone',
  });
  const sj_pillarR = 3.2;
  const sj_corners: Vector3[] = [];
  for (let sj_k = 0; sj_k < sj_sides; sj_k++) {
    const sj_a = (sj_k / sj_sides) * Math.PI * 2;
    const sj_c = new Vector3(Math.cos(sj_a) * sj_pillarR, 0, Math.sin(sj_a) * sj_pillarR);
    sj_corners.push(sj_c);
    addPillar(sj_b, mul(sj_m, T(sj_c.x, 0, sj_c.z)), 0.16, 2.75);
    const sj_w = sj_toWorld(sj_p, sj_c.x, sj_c.z);
    sj_col.circle(sj_w.x, sj_w.z, 0.2, sj_deck - 0.2, sj_deck + 3, 'pillar');
  }
  // ring beams and benches ("beauty's rest" backrests) on four sides
  let sj_entrance = { x: sj_p.x, z: sj_p.z, nx: 0, nz: 1 };
  for (let sj_k = 0; sj_k < sj_sides; sj_k++) {
    const sj_a0 = sj_corners[sj_k]!;
    const sj_a1 = sj_corners[(sj_k + 1) % sj_sides]!;
    const sj_mid = new Vector3().lerpVectors(sj_a0, sj_a1, 0.5);
    const sj_len = sj_a0.distanceTo(sj_a1);
    const sj_yaw = Math.atan2(sj_a1.x - sj_a0.x, sj_a1.z - sj_a0.z) + Math.PI / 2;
    addBeam(sj_b, mul(sj_m, T(sj_mid.x, 2.95, sj_mid.z, 0, sj_yaw)), sj_len - 0.2, 0.26, 0.2);
    // hanging lattice fringe under the beam
    sj_b.add(
      'lattice',
      new PlaneGeometry(sj_len - 0.4, 0.35),
      '#ffffff',
      mul(sj_m, T(sj_mid.x * 0.99, 2.62, sj_mid.z * 0.99, 0, sj_yaw)),
    );
    const sj_open = sj_k === 3 || sj_k === 0; // entrances: towards the shore and towards the lake
    if (sj_k === 0) {
      const sj_w = sj_toWorld(sj_p, sj_mid.x, sj_mid.z);
      const sj_out = sj_toWorld(sj_p, sj_mid.x * 2, sj_mid.z * 2);
      const sj_l = Math.hypot(sj_out.x - sj_w.x, sj_out.z - sj_w.z);
      sj_entrance = {
        x: sj_w.x,
        z: sj_w.z,
        nx: (sj_out.x - sj_w.x) / sj_l,
        nz: (sj_out.z - sj_w.z) / sj_l,
      };
    }
    if (!sj_open) {
      const sj_inward = sj_mid.clone().multiplyScalar(0.93);
      sj_b.add(
        'paint',
        box(sj_len - 0.45, 0.1, 0.45),
        sj_PAL.woodLight,
        mul(sj_m, T(sj_inward.x, 0.45, sj_inward.z, 0, sj_yaw)),
      );
      sj_b.add(
        'paint',
        box(sj_len - 0.45, 0.45, 0.06),
        sj_PAL.vermilion,
        mul(sj_m, T(sj_mid.x * 1.0, 0.72, sj_mid.z * 1.0, -0.35, sj_yaw)),
      );
      const sj_w = sj_toWorld(sj_p, sj_inward.x, sj_inward.z);
      sj_col.box(
        sj_w.x,
        sj_w.z,
        (sj_len - 0.45) / 2,
        0.28,
        sj_p.rot + sj_yaw,
        sj_deck - 0.2,
        sj_deck + 0.55,
        'bench',
      );
    }
  }
  const sj_roof = addPolygonRoof(
    sj_b,
    mul(sj_m, T(0, 3.15, 0)),
    sj_sides,
    4.7,
    { height: 2.5, lift: 0.6, thickness: 0.14 },
    { tile: sj_PAL.tileSlate, ridge: '#333b44', under: sj_PAL.underside },
  );
  addFinial(sj_b, mul(sj_m, T(0, 3.15 + sj_roof.topY - 0.1, 0)), 1.4);
  for (const [sj_i, sj_c] of sj_roof.corners.entries()) {
    if (sj_i % 2 === 0)
      addLantern(sj_b, mul(sj_m, T(sj_c.x * 0.93, 3.15 + sj_c.y - 0.75, sj_c.z * 0.93)), 0.2);
  }
  // stone table with stools and a tea set
  sj_b.add(
    'paint',
    new CylinderGeometry(0.62, 0.45, 0.72, 16).translate(0, 0.36, 0),
    sj_PAL.stone,
    sj_m,
  );
  sj_b.add(
    'paint',
    new CylinderGeometry(0.7, 0.7, 0.08, 20).translate(0, 0.76, 0),
    sj_PAL.stoneDark,
    sj_m,
  );
  sj_col.circle(sj_p.x, sj_p.z, 0.7, sj_deck - 0.2, sj_deck + 0.8, 'table');
  for (let sj_k = 0; sj_k < 4; sj_k++) {
    const sj_a = (sj_k / 4) * Math.PI * 2 + Math.PI / 4;
    sj_b.add(
      'paint',
      new CylinderGeometry(0.22, 0.26, 0.45, 12).translate(0, 0.225, 0),
      sj_PAL.stone,
      mul(sj_m, T(Math.cos(sj_a) * 1.15, 0, Math.sin(sj_a) * 1.15)),
    );
  }
  const sj_teapot = new SphereGeometry(0.13, 14, 10);
  sj_teapot.scale(1, 0.8, 1);
  sj_b.add('paint', sj_teapot, '#cfe3dc', mul(sj_m, T(-0.15, 0.9, 0.05)));
  sj_b.add(
    'paint',
    new CylinderGeometry(0.02, 0.03, 0.16, 6),
    '#cfe3dc',
    mul(sj_m, T(-0.02, 0.93, 0.05, 0, 0, -1.0)),
  );
  sj_b.add(
    'paint',
    new TorusGeometry(0.06, 0.012, 5, 10),
    '#cfe3dc',
    mul(sj_m, T(-0.29, 0.92, 0.05)),
  );
  for (const [sj_x, sj_z] of [
    [0.22, -0.18],
    [0.25, 0.2],
  ]) {
    sj_b.add(
      'paint',
      new CylinderGeometry(0.045, 0.035, 0.06, 10).translate(0, 0.03, 0),
      '#f3efe4',
      mul(sj_m, T(sj_x!, 0.8, sj_z!)),
    );
  }
  return { table: { x: sj_p.x, y: sj_deck + 0.8, z: sj_p.z }, entrance: sj_entrance };
}

/* ---------------------------------------------------------------- Houses */

export function buildHouse(
  sj_b: ArchBuilder,
  sj_col: CollisionWorld,
  sj_def: HouseDef,
  sj_y: number,
): void {
  const sj_m = T(sj_def.x, sj_y, sj_def.z, 0, sj_def.rot);
  const sj_w = sj_def.width;
  const sj_d = sj_def.depth;
  const sj_wallH = sj_def.style === 'hall' ? 3.4 : 3.0;
  const sj_plinth = 0.35;
  sj_b.add(
    'paint',
    box(sj_w + 0.9, sj_plinth + 0.6, sj_d + 0.9).translate(0, (sj_plinth - 0.6) / 2, 0),
    sj_PAL.stone,
    sj_m,
  );
  sj_col.addPlatform({
    shape: {
      type: 'box',
      x: sj_def.x,
      z: sj_def.z,
      hx: (sj_w + 0.9) / 2,
      hz: (sj_d + 0.9) / 2,
      rot: sj_def.rot,
    },
    top: sj_y + sj_plinth,
    bottom: sj_y - 1,
    surface: 'stone',
  });
  sj_col.box(
    sj_def.x,
    sj_def.z,
    sj_w / 2 + 0.05,
    sj_d / 2 + 0.05,
    sj_def.rot,
    sj_y,
    sj_y + 5,
    'house',
  );
  const sj_wm = mul(sj_m, T(0, sj_plinth, 0));
  sj_b.add('paint', box(sj_w, sj_wallH, sj_d).translate(0, sj_wallH / 2, 0), sj_PAL.plaster, sj_wm);
  // timber frame
  const sj_frame = sj_def.style === 'hall' ? sj_PAL.vermilion : sj_PAL.wood;
  for (const sj_sx of [-1, 1]) {
    for (const sj_sz of [-1, 1])
      sj_b.add(
        'paint',
        box(0.2, sj_wallH, 0.2).translate(0, sj_wallH / 2, 0),
        sj_frame,
        mul(sj_wm, T((sj_sx * sj_w) / 2, 0, (sj_sz * sj_d) / 2)),
      );
  }
  for (const sj_sz of [-1, 1]) {
    sj_b.add(
      'paint',
      box(sj_w + 0.1, 0.18, 0.1),
      sj_frame,
      mul(sj_wm, T(0, sj_wallH - 0.1, (sj_sz * sj_d) / 2 + 0.03)),
    );
    sj_b.add(
      'paint',
      box(sj_w + 0.1, 0.12, 0.08),
      sj_frame,
      mul(sj_wm, T(0, 1.0, (sj_sz * sj_d) / 2 + 0.03)),
    );
  }
  for (const sj_sx of [-1, 1]) {
    sj_b.add(
      'paint',
      box(0.1, 0.18, sj_d + 0.1),
      sj_frame,
      mul(sj_wm, T((sj_sx * sj_w) / 2 + 0.03, sj_wallH - 0.1, 0)),
    );
    sj_b.add(
      'lattice',
      new PlaneGeometry(sj_d * 0.45, 1.0),
      '#ffffff',
      mul(sj_wm, T((sj_sx * sj_w) / 2 + 0.04, 1.75, 0, 0, (sj_sx * Math.PI) / 2)),
    );
  }
  // front: door flanked by lattice windows; back: two windows
  sj_b.add(
    'paint',
    box(1.3, 2.15, 0.1).translate(0, 1.075, 0),
    '#4a2a1b',
    mul(sj_wm, T(0, 0, sj_d / 2 + 0.02)),
  );
  sj_b.add('paint', box(1.6, 0.16, 0.14), sj_frame, mul(sj_wm, T(0, 2.25, sj_d / 2 + 0.04)));
  for (const sj_sx of [-1, 1]) {
    sj_b.add(
      'lattice',
      new PlaneGeometry(1.1, 1.0),
      '#ffffff',
      mul(sj_wm, T(sj_sx * (sj_w / 2 - 1.05), 1.75, sj_d / 2 + 0.04)),
    );
    sj_b.add(
      'lattice',
      new PlaneGeometry(1.1, 1.0),
      '#ffffff',
      mul(sj_wm, T(sj_sx * (sj_w / 2 - 1.3), 1.75, -sj_d / 2 - 0.04, 0, Math.PI)),
    );
  }
  if (sj_def.style === 'hall') {
    // porch with red columns
    for (const sj_sx of [-1.5, -0.5, 0.5, 1.5])
      addPillar(sj_b, mul(sj_wm, T(sj_sx * (sj_w / 4), 0, sj_d / 2 + 1.2)), 0.14, sj_wallH - 0.2);
  }
  const sj_roofColor = sj_def.style === 'house' ? sj_PAL.tileSlate : sj_PAL.tileTeal;
  addHipRoof(
    sj_b,
    mul(sj_wm, T(0, sj_wallH + 0.05, 0)),
    sj_w / 2 + (sj_def.style === 'hall' ? 1.3 : 0.95),
    sj_d / 2 + (sj_def.style === 'hall' ? 1.9 : 0.95),
    { height: sj_def.style === 'hall' ? 2.2 : 1.8, lift: 0.45, thickness: 0.12 },
    { tile: sj_roofColor, ridge: '#2f363d', under: sj_PAL.underside },
  );
  // lanterns by the door
  for (const sj_sx of [-1, 1]) {
    addLantern(sj_b, mul(sj_wm, T(sj_sx * 0.95, sj_wallH - 0.55, sj_d / 2 + 0.55)), 0.2);
    sj_b.add(
      'paint',
      post(0.012, 0.35, 4),
      '#2a1a12',
      mul(sj_wm, T(sj_sx * 0.95, sj_wallH - 0.25, sj_d / 2 + 0.55)),
    );
  }
}

/* ---------------------------------------------------------------- Bridge */

export interface BridgeInfo {
  /** outer-corner positions of each bend (for milestone lanterns), shore to shore */
  milestones: { x: number; y: number; z: number }[];
  deckY: number;
  /** everything standing in the water, for foam rings: centre, half size, corner radius, yaw */
  piers: { x: number; z: number; hx: number; hz: number; round: number; rot: number }[];
}

const sj_DECK_HALF = 1.1;
const sj_LANDING_HALF = 1.3;
const sj_PLANK = 0.27;
const sj_PLANK_GAP = 0.032;
const sj_PLANK_T = 0.07;
const sj_DECK_TONES = ['#9a7250', '#8f6a4a', '#a37a55', '#86664a', '#94704f'];

/** Is the point (world xz) inside the square landing at `sj_c` (rotated by `rot`)? */
function inLanding(
  sj_x: number,
  sj_z: number,
  sj_c: Vector3,
  sj_rot: number,
  sj_half: number,
): boolean {
  const sj_dx = sj_x - sj_c.x;
  const sj_dz = sj_z - sj_c.z;
  const sj_cs = Math.cos(sj_rot);
  const sj_sn = Math.sin(sj_rot);
  const sj_lx = sj_dx * sj_cs - sj_dz * sj_sn;
  const sj_lz = sj_dx * sj_sn + sj_dz * sj_cs;
  return Math.abs(sj_lx) < sj_half && Math.abs(sj_lz) < sj_half;
}

/** Vermilion railing with gilded post caps, top, middle and bottom rails and balusters. */
function addRailing(
  sj_b: ArchBuilder,
  sj_frame: Matrix4,
  sj_x: number,
  sj_s0: number,
  sj_s1: number,
): void {
  const sj_len = sj_s1 - sj_s0;
  const sj_posts = Math.max(2, Math.round(sj_len / 1.5) + 1);
  for (let sj_k = 0; sj_k < sj_posts; sj_k++) {
    const sj_s = sj_s0 + (sj_len * sj_k) / (sj_posts - 1);
    sj_b.add('paint', box(0.16, 0.06, 0.16), sj_PAL.wood, mul(sj_frame, T(sj_x, 0.03, sj_s)));
    sj_b.add('paint', box(0.12, 0.8, 0.12), sj_PAL.vermilion, mul(sj_frame, T(sj_x, 0.4, sj_s)));
    sj_b.add(
      'paint',
      new CylinderGeometry(0.078, 0.078, 0.04, 10),
      sj_PAL.gold,
      mul(sj_frame, T(sj_x, 0.82, sj_s)),
    );
    sj_b.add(
      'paint',
      new SphereGeometry(0.062, 10, 8).scale(1, 1.35, 1),
      sj_PAL.gold,
      mul(sj_frame, T(sj_x, 0.9, sj_s)),
    );
    sj_b.add(
      'paint',
      new ConeGeometry(0.022, 0.07, 6),
      sj_PAL.gold,
      mul(sj_frame, T(sj_x, 1.0, sj_s)),
    );
  }
  const sj_mid = (sj_s0 + sj_s1) / 2;
  sj_b.add(
    'paint',
    box(0.085, 0.07, sj_len),
    sj_PAL.vermilion,
    mul(sj_frame, T(sj_x, 0.74, sj_mid)),
  );
  sj_b.add(
    'paint',
    box(0.06, 0.05, sj_len),
    sj_PAL.vermilion,
    mul(sj_frame, T(sj_x, 0.47, sj_mid)),
  );
  sj_b.add(
    'paint',
    box(0.065, 0.06, sj_len),
    sj_PAL.vermilion,
    mul(sj_frame, T(sj_x, 0.12, sj_mid)),
  );
  const sj_balusters = Math.floor(sj_len / 0.19);
  for (let sj_k = 1; sj_k < sj_balusters; sj_k++) {
    const sj_s = sj_s0 + (sj_len * sj_k) / sj_balusters;
    sj_b.add(
      'paint',
      box(0.03, 0.3, 0.03),
      sj_PAL.vermilionDark,
      mul(sj_frame, T(sj_x, 0.295, sj_s)),
    );
  }
}

/** Stone pier in courses of masonry, from the lake bed up to `top` (local y = 0 at the bed). */
function addMasonryPier(
  sj_b: ArchBuilder,
  sj_m: Matrix4,
  sj_half: number,
  sj_height: number,
  sj_rand: Random,
): void {
  const sj_courses = Math.max(1, Math.round(sj_height / 0.42));
  const sj_h = sj_height / sj_courses;
  for (let sj_k = 0; sj_k < sj_courses; sj_k++) {
    const sj_inset = sj_rand.range(-0.025, 0.02);
    sj_b.add(
      'paint',
      box((sj_half + sj_inset) * 2, sj_h - 0.025, (sj_half + sj_rand.range(-0.025, 0.02)) * 2),
      sj_k % 2 ? sj_PAL.stone : sj_PAL.stoneDark,
      mul(sj_m, T(0, sj_k * sj_h + sj_h / 2, 0, 0, sj_rand.spread(0.015))),
      'stone',
    );
  }
  // mortar core behind the joints
  sj_b.add(
    'paint',
    box(sj_half * 2 - 0.05, sj_height, sj_half * 2 - 0.05),
    '#6d6558',
    mul(sj_m, T(0, sj_height / 2, 0)),
    'stone',
  );
}

/**
 * Zig-zag bridge: wooden plank decks on timber pile bents, stone landings on masonry
 * piers at every bend, vermilion railings with gilded caps, stone abutments at the shores.
 */
export function buildBridge(
  sj_b: ArchBuilder,
  sj_col: CollisionWorld,
  sj_points: readonly (readonly [number, number])[],
  sj_ground: (sj_x: number, sj_z: number) => number,
): BridgeInfo {
  const sj_deckY = sj_WATER_LEVEL + 0.62;
  const sj_landingTop = sj_deckY + 0.03;
  const sj_rand = new Random(77);
  const sj_pts = sj_points.map(([sj_x, sj_z]) => new Vector3(sj_x, sj_deckY, sj_z));
  const sj_last = sj_pts.length - 2;
  const sj_milestones: BridgeInfo['milestones'] = [];
  const sj_piers: BridgeInfo['piers'] = [];
  const sj_landingRot = (sj_i: number) =>
    Math.atan2(sj_pts[sj_i + 1]!.x - sj_pts[sj_i]!.x, sj_pts[sj_i + 1]!.z - sj_pts[sj_i]!.z);

  for (let sj_i = 0; sj_i <= sj_last; sj_i++) {
    const sj_a = sj_pts[sj_i]!;
    const sj_c = sj_pts[sj_i + 1]!;
    const sj_dir = new Vector3().subVectors(sj_c, sj_a);
    const sj_len = sj_dir.length();
    sj_dir.normalize();
    const sj_yaw = Math.atan2(sj_dir.x, sj_dir.z);
    // segment frame: x across the deck, y up from the deck surface, z along from `sj_a`
    const sj_frame = T(sj_a.x, sj_deckY, sj_a.z, 0, sj_yaw);
    const sj_side = new Vector3(sj_dir.z, 0, -sj_dir.x);
    const sj_at = (sj_x: number, sj_s: number) =>
      new Vector3(
        sj_a.x + sj_side.x * sj_x + sj_dir.x * sj_s,
        sj_deckY,
        sj_a.z + sj_side.z * sj_x + sj_dir.z * sj_s,
      );

    // Deck planks, skipping those hidden inside a landing.
    const sj_sStart = sj_i === 0 ? -0.5 : 0.6;
    const sj_sEnd = sj_i === sj_last ? sj_len + 0.5 : sj_len - 0.6;
    for (let sj_s = sj_sStart + sj_PLANK / 2; sj_s < sj_sEnd; sj_s += sj_PLANK + sj_PLANK_GAP) {
      const sj_corners = [
        sj_at(-sj_DECK_HALF, sj_s - sj_PLANK / 2),
        sj_at(sj_DECK_HALF, sj_s - sj_PLANK / 2),
        sj_at(-sj_DECK_HALF, sj_s + sj_PLANK / 2),
        sj_at(sj_DECK_HALF, sj_s + sj_PLANK / 2),
      ];
      const sj_hidden = (sj_k: number) =>
        sj_k > 0 &&
        sj_k < sj_pts.length - 1 &&
        sj_corners.every((sj_p) =>
          inLanding(sj_p.x, sj_p.z, sj_pts[sj_k]!, sj_landingRot(sj_k), sj_LANDING_HALF - 0.04),
        );
      if (sj_hidden(sj_i) || sj_hidden(sj_i + 1)) continue;
      sj_b.add(
        'paint',
        box(
          sj_DECK_HALF * 2 + sj_rand.range(-0.05, 0.04),
          sj_PLANK_T,
          sj_PLANK + sj_rand.range(-0.01, 0.01),
        ),
        sj_rand.pick(sj_DECK_TONES),
        mul(
          sj_frame,
          T(
            sj_rand.range(-0.025, 0.025),
            -sj_PLANK_T / 2 + sj_rand.range(-0.004, 0.002),
            sj_s,
            0,
            sj_rand.spread(0.012),
          ),
        ),
        'wood',
      );
    }
    // Stringers under the planks and vermilion fascia boards along both edges.
    const sj_spanFrom = sj_i === 0 ? -0.5 : 0.9;
    const sj_spanTo = sj_i === sj_last ? sj_len + 0.5 : sj_len - 0.9;
    const sj_spanMid = (sj_spanFrom + sj_spanTo) / 2;
    const sj_spanLen = sj_spanTo - sj_spanFrom;
    for (const sj_sx of [-1, 1]) {
      sj_b.add(
        'paint',
        box(0.14, 0.22, sj_spanLen),
        '#4a2a1b',
        mul(sj_frame, T(sj_sx * (sj_DECK_HALF - 0.2), -sj_PLANK_T - 0.11, sj_spanMid)),
      );
      sj_b.add(
        'paint',
        box(0.05, 0.2, sj_spanLen),
        sj_PAL.vermilion,
        mul(sj_frame, T(sj_sx * (sj_DECK_HALF + 0.025), -0.08, sj_spanMid)),
      );
    }
    sj_col.addPlatform({
      shape: {
        type: 'box',
        x: (sj_a.x + sj_c.x) / 2,
        z: (sj_a.z + sj_c.z) / 2,
        hx: sj_DECK_HALF + 0.05,
        hz: sj_len / 2 + 0.2,
        rot: sj_yaw,
      },
      top: sj_deckY,
      bottom: sj_deckY - 0.45,
      surface: 'wood',
    });

    // Timber pile bents between the landings.
    const sj_bentFrom = sj_i === 0 ? 0.6 : sj_LANDING_HALF + 0.9;
    const sj_bentTo = sj_i === sj_last ? sj_len - 0.6 : sj_len - sj_LANDING_HALF - 0.9;
    const sj_bents = Math.max(1, Math.ceil((sj_bentTo - sj_bentFrom) / 3.2));
    for (let sj_k = 0; sj_k <= sj_bents; sj_k++) {
      const sj_s = sj_bentFrom + ((sj_bentTo - sj_bentFrom) * sj_k) / sj_bents;
      const sj_capY = -sj_PLANK_T - 0.22 - 0.07;
      sj_b.add(
        'paint',
        box(sj_DECK_HALF * 2 - 0.04, 0.14, 0.2),
        '#4a2a1b',
        mul(sj_frame, T(0, sj_capY, sj_s)),
      );
      for (const sj_sx of [-1, 1]) {
        const sj_p = sj_at(sj_sx * (sj_DECK_HALF - 0.2), sj_s);
        const sj_bed = Math.min(sj_ground(sj_p.x, sj_p.z), sj_WATER_LEVEL - 0.2) - 0.3;
        const sj_hgt = sj_deckY + sj_capY - sj_bed;
        sj_b.add(
          'paint',
          new CylinderGeometry(0.1, 0.115, sj_hgt, 8).translate(0, sj_hgt / 2, 0),
          '#5b3a22',
          T(sj_p.x, sj_bed, sj_p.z, 0, sj_rand.range(0, 3)),
        );
        if (sj_ground(sj_p.x, sj_p.z) < sj_WATER_LEVEL - 0.05)
          sj_piers.push({ x: sj_p.x, z: sj_p.z, hx: 0.11, hz: 0.11, round: 0.11, rot: 0 });
      }
    }

    // Railings, left and right, leaving the bends open.
    const sj_railFrom = sj_i === 0 ? 0.9 : 1.45;
    const sj_railTo = sj_i === sj_last ? sj_len - 0.9 : sj_len - 1.45;
    if (sj_railTo - sj_railFrom > 0.8) {
      for (const sj_sx of [-1, 1]) {
        addRailing(sj_b, sj_frame, sj_sx * (sj_DECK_HALF - 0.07), sj_railFrom, sj_railTo);
        const sj_from = sj_at(sj_sx * (sj_DECK_HALF - 0.07), sj_railFrom);
        const sj_to = sj_at(sj_sx * (sj_DECK_HALF - 0.07), sj_railTo);
        const sj_rm = new Vector3().lerpVectors(sj_from, sj_to, 0.5);
        sj_col.box(
          sj_rm.x,
          sj_rm.z,
          0.08,
          sj_from.distanceTo(sj_to) / 2,
          sj_yaw,
          sj_deckY + 0.05,
          sj_deckY + 0.85,
          'rail',
        );
      }
    }
  }

  // Stone landings on masonry piers at every bend.
  for (let sj_i = 1; sj_i < sj_pts.length - 1; sj_i++) {
    const sj_p = sj_pts[sj_i]!;
    const sj_rot = sj_landingRot(sj_i);
    const sj_m = T(sj_p.x, 0, sj_p.z, 0, sj_rot);
    const sj_bed = Math.min(sj_ground(sj_p.x, sj_p.z), sj_WATER_LEVEL - 0.3) - 0.2;
    // paving: four slabs over a darker bed, so the joints read
    sj_b.add(
      'paint',
      box(sj_LANDING_HALF * 2 - 0.04, 0.28, sj_LANDING_HALF * 2 - 0.04),
      '#6d6558',
      mul(sj_m, T(0, sj_landingTop - 0.18, 0)),
      'stone',
    );
    for (const [sj_qx, sj_qz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      sj_b.add(
        'paint',
        box(sj_LANDING_HALF - 0.025, 0.3, sj_LANDING_HALF - 0.025),
        sj_rand.chance(0.5) ? sj_PAL.stone : '#aa9f8a',
        mul(
          sj_m,
          T(sj_qx * sj_LANDING_HALF * 0.5, sj_landingTop - 0.15, sj_qz * sj_LANDING_HALF * 0.5),
        ),
        'stone',
      );
    }
    // cornice under the paving, then the pier itself
    sj_b.add(
      'paint',
      box(2.36, 0.1, 2.36),
      sj_PAL.stoneDark,
      mul(sj_m, T(0, sj_landingTop - 0.35, 0)),
      'stone',
    );
    addMasonryPier(sj_b, mul(sj_m, T(0, sj_bed, 0)), 1.02, sj_landingTop - 0.4 - sj_bed, sj_rand);
    sj_piers.push({ x: sj_p.x, z: sj_p.z, hx: 1.04, hz: 1.04, round: 0.08, rot: sj_rot });
    sj_col.addPlatform({
      shape: {
        type: 'box',
        x: sj_p.x,
        z: sj_p.z,
        hx: sj_LANDING_HALF,
        hz: sj_LANDING_HALF,
        rot: sj_rot,
      },
      top: sj_landingTop,
      bottom: sj_deckY - 0.45,
      surface: 'stone',
    });
    // outer corner of the bend: opposite the average of the two segment directions
    const sj_d1 = new Vector3().subVectors(sj_pts[sj_i - 1]!, sj_p).normalize();
    const sj_d2 = new Vector3().subVectors(sj_pts[sj_i + 1]!, sj_p).normalize();
    const sj_outer = sj_d1.add(sj_d2).multiplyScalar(-1);
    if (sj_outer.lengthSq() < 1e-4) sj_outer.set(1, 0, 0);
    sj_outer.normalize();
    sj_milestones.push({
      x: sj_p.x + sj_outer.x * 1.05,
      y: sj_landingTop,
      z: sj_p.z + sj_outer.z * 1.05,
    });
  }

  // Stone abutments where the bridge meets each shore.
  for (const [sj_end, sj_next] of [
    [sj_pts[0]!, sj_pts[1]!],
    [sj_pts[sj_pts.length - 1]!, sj_pts[sj_pts.length - 2]!],
  ] as const) {
    const sj_out = new Vector3().subVectors(sj_end, sj_next).normalize();
    const sj_yaw = Math.atan2(sj_out.x, sj_out.z);
    const sj_cx = sj_end.x + sj_out.x * 0.35;
    const sj_cz = sj_end.z + sj_out.z * 0.35;
    const sj_g = sj_ground(sj_cx, sj_cz);
    const sj_depth = sj_landingTop - Math.min(sj_g, sj_deckY) + 0.5;
    sj_b.add(
      'paint',
      box(sj_DECK_HALF * 2 + 0.5, sj_depth, 1.5),
      sj_PAL.stone,
      T(sj_cx, sj_landingTop - sj_depth / 2, sj_cz, 0, sj_yaw),
      'stone',
    );
    sj_b.add(
      'paint',
      box(sj_DECK_HALF * 2 + 0.62, 0.08, 1.58),
      sj_PAL.stoneDark,
      T(sj_cx, sj_landingTop - 0.26, sj_cz, 0, sj_yaw),
      'stone',
    );
    sj_col.addPlatform({
      shape: { type: 'box', x: sj_cx, z: sj_cz, hx: sj_DECK_HALF + 0.25, hz: 0.75, rot: sj_yaw },
      top: sj_landingTop,
      bottom: sj_landingTop - 1,
      surface: 'stone',
    });
  }

  // shore ends also get a milestone
  const sj_first = sj_pts[0]!;
  const sj_lastPt = sj_pts[sj_pts.length - 1]!;
  sj_milestones.unshift({ x: sj_first.x + 1.5, y: sj_deckY, z: sj_first.z + 0.4 });
  sj_milestones.push({ x: sj_lastPt.x - 1.5, y: sj_deckY, z: sj_lastPt.z - 0.4 });
  for (const sj_ms of sj_milestones) {
    addStoneLantern(sj_b, T(sj_ms.x, sj_ms.y, sj_ms.z), 0.75);
    sj_col.circle(sj_ms.x, sj_ms.z, 0.32, sj_ms.y - 0.2, sj_ms.y + 1.6, 'milestone');
  }
  return { milestones: sj_milestones, deckY: sj_deckY, piers: sj_piers };
}

/* ------------------------------------------------------------ Bell tower */

export interface BellParts {
  bell: Mesh;
  striker: Mesh;
  pivot: Vector3;
}

/** Open bell pavilion with a bronze bell and a hanging log striker (both animated). */
export function buildBellTower(sj_b: ArchBuilder, sj_col: CollisionWorld, sj_p: Placed): BellParts {
  const sj_m = T(sj_p.x, sj_p.y, sj_p.z, 0, sj_p.rot);
  sj_b.add('paint', box(4.6, 0.6, 4.6).translate(0, -0.1, 0), sj_PAL.stone, sj_m);
  sj_col.addPlatform({
    shape: { type: 'box', x: sj_p.x, z: sj_p.z, hx: 2.3, hz: 2.3, rot: sj_p.rot },
    top: sj_p.y + 0.2,
    bottom: sj_p.y - 1,
    surface: 'stone',
  });
  for (const sj_sx of [-1, 1]) {
    for (const sj_sz of [-1, 1]) {
      addPillar(sj_b, mul(sj_m, T(sj_sx * 1.7, 0.2, sj_sz * 1.7)), 0.16, 3.3);
      const sj_w = sj_toWorld(sj_p, sj_sx * 1.7, sj_sz * 1.7);
      sj_col.circle(sj_w.x, sj_w.z, 0.22, sj_p.y, sj_p.y + 4, 'pillar');
    }
    addBeam(sj_b, mul(sj_m, T(sj_sx * 1.7, 3.6, 0, 0, Math.PI / 2)), 3.6, 0.26, 0.22);
  }
  addBeam(sj_b, mul(sj_m, T(0, 3.6, -1.7)), 3.6, 0.26, 0.22);
  addBeam(sj_b, mul(sj_m, T(0, 3.6, 1.7)), 3.6, 0.26, 0.22);
  addBeam(sj_b, mul(sj_m, T(0, 3.35, 0)), 3.6, 0.3, 0.26);
  addHipRoof(
    sj_b,
    mul(sj_m, T(0, 3.8, 0)),
    2.95,
    2.75,
    { height: 1.6, lift: 0.5, thickness: 0.12 },
    {
      tile: sj_PAL.tileSlate,
      ridge: '#333b44',
      under: sj_PAL.underside,
    },
  );

  const sj_profile = [
    [0.001, 0],
    [0.62, 0.02],
    [0.66, 0.12],
    [0.58, 0.25],
    [0.5, 0.6],
    [0.46, 1.0],
    [0.42, 1.28],
    [0.3, 1.38],
    [0.001, 1.42],
  ].map(([sj_r, sj_y]) => new Vector2(sj_r!, sj_y!));
  const sj_bellGeo = new LatheGeometry(sj_profile, 28);
  sj_bellGeo.translate(0, -1.62, 0);
  const sj_bellMat = new MeshStandardMaterial({
    color: sj_PAL.bronze,
    roughness: 0.38,
    metalness: 0.75,
    side: DoubleSide,
  });
  const sj_bell = new Mesh(sj_bellGeo, sj_bellMat);
  const sj_ring = new Mesh(new TorusGeometry(0.14, 0.05, 8, 16), sj_bellMat);
  sj_ring.position.y = -0.12;
  sj_bell.add(sj_ring);
  for (const sj_yb of [-0.55, -1.2]) {
    const sj_band = new Mesh(
      new TorusGeometry(sj_yb < -1 ? 0.6 : 0.49, 0.025, 6, 32),
      new MeshStandardMaterial({ color: '#c9a454', metalness: 0.8, roughness: 0.3 }),
    );
    sj_band.rotation.x = Math.PI / 2;
    sj_band.position.y = sj_yb;
    sj_bell.add(sj_band);
  }
  const sj_pivot = new Vector3(sj_p.x, sj_p.y + 3.25, sj_p.z);
  sj_bell.position.copy(sj_pivot);
  sj_bell.rotation.y = sj_p.rot;
  sj_bell.castShadow = true;
  sj_bell.name = 'bell';
  sj_col.circle(sj_p.x, sj_p.z, 0.7, sj_p.y + 1.4, sj_p.y + 3.2, 'bell');

  const sj_striker = new Mesh(
    new CylinderGeometry(0.13, 0.13, 1.5, 10).rotateZ(Math.PI / 2),
    new MeshStandardMaterial({ color: sj_PAL.woodLight, roughness: 0.8 }),
  );
  const sj_sp = sj_toWorld(sj_p, 1.35, 0);
  sj_striker.position.set(sj_sp.x, sj_p.y + 2.25, sj_sp.z);
  sj_striker.rotation.y = sj_p.rot;
  sj_striker.castShadow = true;
  sj_striker.name = 'bell-striker';
  // ropes
  for (const sj_s of [-0.5, 0.5]) {
    const sj_rp = sj_toWorld(sj_p, 1.35 + sj_s, 0);
    sj_b.add('paint', post(0.015, 1.0, 4), '#6b5a3a', T(sj_rp.x, sj_p.y + 2.3, sj_rp.z));
  }
  return { bell: sj_bell, striker: sj_striker, pivot: sj_pivot };
}

/* -------------------------------------------------------------- Signpost */

/** Board size and spacing (m): boards stack down from `top` above the post's foot. */
export const sj_SIGNPOST = { boardWidth: 2.1, boardHeight: 0.48, top: 3.35, step: 0.56 };

export function buildSignpost(
  sj_b: ArchBuilder,
  sj_col: CollisionWorld,
  sj_p: Placed,
  sj_arrows: { yaw: number }[],
  sj_texture: Texture,
): Mesh {
  const sj_m = T(sj_p.x, sj_p.y, sj_p.z);
  // boards stacked down from the top of a 3.75 m post
  const sj_bw = sj_SIGNPOST.boardWidth;
  const sj_bh = sj_SIGNPOST.boardHeight;
  const sj_top = sj_SIGNPOST.top;
  const sj_step = sj_SIGNPOST.step;
  sj_b.add('paint', post(0.12, 3.75, 8), sj_PAL.wood, sj_m);
  sj_b.add(
    'paint',
    new CylinderGeometry(0.26, 0.3, 0.22, 8).translate(0, 0.11, 0),
    sj_PAL.stoneDark,
    sj_m,
  );
  sj_b.add(
    'paint',
    new CylinderGeometry(0.02, 0.16, 0.22, 8).translate(0, 3.86, 0),
    sj_PAL.wood,
    sj_m,
  );
  sj_col.circle(sj_p.x, sj_p.z, 0.22, sj_p.y, sj_p.y + 3.75, 'signpost');
  const sj_boards = sj_arrows.length;
  const sj_geos: BufferGeometry[] = [];
  sj_arrows.forEach((sj_a, sj_i) => {
    // a board UV-mapped to its row in the atlas, readable from both sides
    const sj_front = new PlaneGeometry(sj_bw, sj_bh);
    const sj_uv = sj_front.attributes.uv!;
    for (let sj_k = 0; sj_k < sj_uv.count; sj_k++)
      sj_uv.setY(sj_k, 1 - (sj_i + 1 - sj_uv.getY(sj_k)) / sj_boards);
    sj_front.translate(sj_bw / 2 + 0.12, sj_top - sj_i * sj_step, 0.016);
    const sj_back = sj_front.clone();
    const sj_bu = sj_back.attributes.uv!;
    for (let sj_k = 0; sj_k < sj_bu.count; sj_k++) sj_bu.setX(sj_k, 1 - sj_bu.getX(sj_k));
    const sj_idx = sj_back.index!;
    for (let sj_k = 0; sj_k < sj_idx.count; sj_k += 3) {
      const sj_t = sj_idx.getX(sj_k + 1);
      sj_idx.setX(sj_k + 1, sj_idx.getX(sj_k + 2));
      sj_idx.setX(sj_k + 2, sj_t);
    }
    sj_back.translate(0, 0, -0.032);
    const sj_bn = sj_back.attributes.normal!;
    for (let sj_k = 0; sj_k < sj_bn.count; sj_k++) sj_bn.setZ(sj_k, -1);
    const sj_plank = box(sj_bw + 0.03, sj_bh + 0.02, 0.03).translate(
      sj_bw / 2 + 0.12,
      sj_top - sj_i * sj_step,
      0,
    );
    sj_plank.deleteAttribute('uv');
    sj_b.add('paint', sj_plank, sj_PAL.wood, mul(sj_m, T(0, 0, 0, 0, sj_a.yaw - Math.PI / 2)));
    for (const sj_g of [sj_front, sj_back]) sj_geos.push(sj_g.rotateY(sj_a.yaw - Math.PI / 2));
  });
  const sj_merged = mergeGeometries(sj_geos, false)!;
  const sj_mesh = new Mesh(
    sj_merged,
    new MeshStandardMaterial({ map: sj_texture, roughness: 0.8 }),
  );
  sj_mesh.position.set(sj_p.x, sj_p.y, sj_p.z);
  sj_mesh.castShadow = true;
  sj_mesh.name = 'signpost-boards';
  return sj_mesh;
}

/* ------------------------------------------------------- Village details */

/** Strings of lanterns across the village street and a few props. */
export function buildVillageDetails(
  sj_b: ArchBuilder,
  sj_col: CollisionWorld,
  sj_ground: (sj_x: number, sj_z: number) => number,
): void {
  for (const sj_x of [16, 27, 38]) {
    const sj_zA = 34.8;
    const sj_zB = 42.2;
    const sj_yA = sj_ground(sj_x, sj_zA);
    const sj_yB = sj_ground(sj_x + 0.6, sj_zB);
    sj_b.add('paint', post(0.09, 4.2, 6), sj_PAL.wood, T(sj_x, sj_yA, sj_zA));
    sj_b.add('paint', post(0.09, 4.2, 6), sj_PAL.wood, T(sj_x + 0.6, sj_yB, sj_zB));
    sj_col.circle(sj_x, sj_zA, 0.15, sj_yA, sj_yA + 4, 'pole');
    sj_col.circle(sj_x + 0.6, sj_zB, 0.15, sj_yB, sj_yB + 4, 'pole');
    const sj_pts: Vector3[] = [];
    for (let sj_k = 0; sj_k <= 12; sj_k++) {
      const sj_t = sj_k / 12;
      const sj_sag = Math.sin(Math.PI * sj_t) * 0.7;
      sj_pts.push(
        new Vector3(
          sj_x + 0.6 * sj_t,
          sj_yA + (sj_yB - sj_yA) * sj_t + 4.1 - sj_sag,
          sj_zA + (sj_zB - sj_zA) * sj_t,
        ),
      );
    }
    sj_b.add('paint', tubeAlong(sj_pts, 0.015, 4), '#2a1a12', T());
    for (let sj_k = 1; sj_k < 6; sj_k++) {
      const sj_p = sj_pts[Math.round((sj_k / 6) * 12)]!;
      addLantern(
        sj_b,
        T(sj_p.x, sj_p.y - 0.35, sj_p.z),
        0.17,
        sj_k % 2 ? sj_PAL.lanternRed : '#e8a23a',
      );
    }
  }
  // barrels, crates and water jars by the houses
  const sj_props: [number, number, 'barrel' | 'crate' | 'jar'][] = [
    [19.2, 33.2, 'barrel'],
    [19.9, 34, 'barrel'],
    [44.2, 33.5, 'crate'],
    [44.9, 32.6, 'crate'],
    [29.2, 43.8, 'jar'],
    [30, 44.3, 'jar'],
    [45.4, 43.9, 'barrel'],
  ];
  for (const [sj_x, sj_z, sj_kind] of sj_props) {
    const sj_y = sj_ground(sj_x, sj_z);
    if (sj_kind === 'barrel') {
      sj_b.add(
        'paint',
        new CylinderGeometry(0.38, 0.38, 0.85, 12).translate(0, 0.42, 0),
        sj_PAL.woodLight,
        T(sj_x, sj_y, sj_z),
      );
      sj_b.add(
        'paint',
        new TorusGeometry(0.385, 0.03, 4, 16).rotateX(Math.PI / 2),
        '#3a2a1c',
        T(sj_x, sj_y + 0.2, sj_z),
      );
      sj_b.add(
        'paint',
        new TorusGeometry(0.385, 0.03, 4, 16).rotateX(Math.PI / 2),
        '#3a2a1c',
        T(sj_x, sj_y + 0.65, sj_z),
      );
      sj_col.circle(sj_x, sj_z, 0.4, sj_y, sj_y + 0.9, 'prop');
    } else if (sj_kind === 'crate') {
      sj_b.add(
        'paint',
        box(0.7, 0.6, 0.7).translate(0, 0.3, 0),
        '#9a7050',
        T(sj_x, sj_y, sj_z, 0, sj_x),
      );
      sj_col.circle(sj_x, sj_z, 0.45, sj_y, sj_y + 0.6, 'prop');
    } else {
      const sj_jar = new LatheGeometry(
        [
          [0.001, 0],
          [0.25, 0.02],
          [0.36, 0.3],
          [0.3, 0.62],
          [0.2, 0.72],
          [0.22, 0.78],
        ].map(([sj_r, sj_yy]) => new Vector2(sj_r!, sj_yy!)),
        14,
      );
      sj_b.add('paint', sj_jar, '#7a4a32', T(sj_x, sj_y, sj_z));
      sj_b.add(
        'paint',
        new CircleGeometry(0.2, 12).rotateX(-Math.PI / 2),
        '#2f4f5a',
        T(sj_x, sj_y + 0.76, sj_z),
      );
      sj_col.circle(sj_x, sj_z, 0.38, sj_y, sj_y + 0.8, 'prop');
    }
  }
}
