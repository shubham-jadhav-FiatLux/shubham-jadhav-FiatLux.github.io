import {
  ConeGeometry,
  CylinderGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Matrix4,
} from 'three';
import { box, hipRoof, polygonRoof, post, tubeAlong, type RoofOptions } from './geometry';
import { mul, T, type ArchBuilder } from './Builder';
import { sj_PAL } from './palette';

export { sj_PAL };

export interface RoofColors {
  tile: string;
  ridge: string;
  under: string;
}

/** Curved hip roof with ridge beam, hip ridges and curled ridge ends. */
export function addHipRoof(
  sj_b: ArchBuilder,
  sj_m: Matrix4,
  sj_halfX: number,
  sj_halfZ: number,
  sj_o: RoofOptions,
  sj_c: RoofColors,
): void {
  const sj_r = hipRoof(sj_halfX, sj_halfZ, sj_o);
  sj_b.add('roof', sj_r.top, sj_c.tile, sj_m);
  sj_b.add('paint', sj_r.under, sj_c.under, sj_m);
  const sj_ridgeLen = sj_r.ridgeTo.x - sj_r.ridgeFrom.x;
  if (sj_ridgeLen > 0.05) {
    sj_b.add(
      'paint',
      box(sj_ridgeLen + 0.3, 0.2, 0.22),
      sj_c.ridge,
      mul(sj_m, T(0, sj_r.ridgeFrom.y + 0.06, 0)),
    );
    for (const sj_sx of [-1, 1]) {
      // upturned "fish tail" ridge ends
      sj_b.add(
        'paint',
        new ConeGeometry(0.12, 0.55, 6),
        sj_c.ridge,
        mul(
          sj_m,
          T(sj_sx * (sj_ridgeLen / 2 + 0.2), sj_r.ridgeFrom.y + 0.3, 0, 0, 0, -sj_sx * 0.5),
        ),
      );
    }
  }
  for (const sj_hip of sj_r.hips) sj_b.add('paint', tubeAlong(sj_hip, 0.07, 5), sj_c.ridge, sj_m);
}

/** Polygonal roof (pavilion, pagoda tier). Returns the corners for hanging bells/lanterns. */
export function addPolygonRoof(
  sj_b: ArchBuilder,
  sj_m: Matrix4,
  sj_sides: number,
  sj_radius: number,
  sj_o: RoofOptions,
  sj_c: RoofColors,
  sj_rotation = 0,
): { corners: Vector3[]; topY: number; topRadius: number } {
  const sj_r = polygonRoof(sj_sides, sj_radius, sj_o, sj_rotation);
  sj_b.add('roof', sj_r.top, sj_c.tile, sj_m);
  sj_b.add('paint', sj_r.under, sj_c.under, sj_m);
  for (const sj_hip of sj_r.hips) sj_b.add('paint', tubeAlong(sj_hip, 0.06, 5), sj_c.ridge, sj_m);
  // corner tips
  const sj_corners = sj_r.corners.map((sj_cn) => {
    const sj_tip = new Vector3(sj_cn.x * 1.07, sj_o.lift + 0.05, sj_cn.z * 1.07);
    sj_b.add(
      'paint',
      new SphereGeometry(0.09, 6, 5),
      sj_c.ridge,
      mul(sj_m, T(sj_tip.x, sj_tip.y, sj_tip.z)),
    );
    return sj_tip;
  });
  return { corners: sj_corners, topY: sj_r.topY, topRadius: sj_r.topRadius };
}

/** Gilded finial: stacked rings and a pearl. */
export function addFinial(sj_b: ArchBuilder, sj_m: Matrix4, sj_height: number): void {
  sj_b.add('paint', post(0.1, sj_height * 0.35, 8, 0.08), sj_PAL.gold, sj_m);
  const sj_rings = 5;
  for (let sj_i = 0; sj_i < sj_rings; sj_i++) {
    const sj_y = sj_height * 0.35 + sj_i * sj_height * 0.09;
    sj_b.add(
      'paint',
      new TorusGeometry(0.16 - sj_i * 0.018, 0.035, 5, 12),
      sj_PAL.gold,
      mul(sj_m, T(0, sj_y, 0, Math.PI / 2)),
    );
  }
  sj_b.add(
    'paint',
    post(0.05, sj_height * 0.55, 6, 0.03),
    sj_PAL.gold,
    mul(sj_m, T(0, sj_height * 0.35, 0)),
  );
  sj_b.add(
    'paint',
    new SphereGeometry(0.14, 10, 8),
    sj_PAL.gold,
    mul(sj_m, T(0, sj_height * 0.95, 0)),
  );
}

/** Red lacquered pillar on a stone drum base. */
export function addPillar(
  sj_b: ArchBuilder,
  sj_m: Matrix4,
  sj_radius: number,
  sj_height: number,
  sj_color = sj_PAL.vermilion,
): void {
  sj_b.add(
    'paint',
    new CylinderGeometry(sj_radius * 1.55, sj_radius * 1.7, 0.28, 10).translate(0, 0.14, 0),
    sj_PAL.stone,
    sj_m,
  );
  sj_b.add(
    'paint',
    post(sj_radius, sj_height, 10, sj_radius * 0.94),
    sj_color,
    mul(sj_m, T(0, 0.26, 0)),
  );
  // bracket capital
  sj_b.add(
    'paint',
    box(sj_radius * 2.6, 0.18, sj_radius * 2.6),
    sj_PAL.gold,
    mul(sj_m, T(0, sj_height + 0.2, 0)),
  );
}

/** Painted beam with a teal and gold band (caihua decoration, simplified). */
export function addBeam(
  sj_b: ArchBuilder,
  sj_m: Matrix4,
  sj_length: number,
  sj_height = 0.28,
  sj_depth = 0.24,
): void {
  sj_b.add('paint', box(sj_length, sj_height, sj_depth), sj_PAL.vermilion, sj_m);
  sj_b.add(
    'paint',
    box(sj_length * 0.72, sj_height * 0.62, sj_depth + 0.02),
    sj_PAL.beamTeal,
    sj_m,
  );
  sj_b.add('paint', box(sj_length * 0.3, sj_height * 0.4, sj_depth + 0.04), sj_PAL.gold, sj_m);
}

const sj_lightPos = new Vector3();

/** Red paper lantern (glowing) with dark caps and a tassel. */
export function addLantern(
  sj_b: ArchBuilder,
  sj_m: Matrix4,
  sj_size = 0.32,
  sj_color = sj_PAL.lanternRed,
): void {
  const sj_body = new SphereGeometry(sj_size, 14, 12);
  sj_body.scale(1, 1.12, 1);
  sj_b.add('glow', sj_body, sj_color, sj_m);
  sj_lightPos.setFromMatrixPosition(sj_m);
  sj_b.light({
    x: sj_lightPos.x,
    y: sj_lightPos.y,
    z: sj_lightPos.z,
    size: sj_size,
    kind: 'paper',
  });
  // thin ribs of the bamboo frame
  for (const sj_y of [-0.55, 0, 0.55]) {
    const sj_r = sj_size * Math.sqrt(1 - sj_y * sj_y) * 1.01;
    sj_b.add(
      'paint',
      new TorusGeometry(sj_r, 0.008 + sj_size * 0.015, 4, 18).rotateX(Math.PI / 2),
      '#3a2416',
      mul(sj_m, T(0, sj_y * sj_size * 1.12, 0)),
    );
  }
  sj_b.add(
    'paint',
    new CylinderGeometry(sj_size * 0.45, sj_size * 0.45, sj_size * 0.18, 10),
    '#2a1a12',
    mul(sj_m, T(0, sj_size * 1.1, 0)),
  );
  sj_b.add(
    'paint',
    new CylinderGeometry(sj_size * 0.45, sj_size * 0.45, sj_size * 0.18, 10),
    '#2a1a12',
    mul(sj_m, T(0, -sj_size * 1.1, 0)),
  );
  sj_b.add(
    'paint',
    post(0.015, sj_size * 1.2, 4),
    sj_PAL.gold,
    mul(sj_m, T(0, -sj_size * 2.35, 0)),
  );
  sj_b.add(
    'paint',
    new ConeGeometry(sj_size * 0.16, sj_size * 0.7, 6),
    sj_PAL.lanternRed,
    mul(sj_m, T(0, -sj_size * 2.2, 0, Math.PI)),
  );
}

/** Stone lantern (for paths and gardens) with a glowing window. */
export function addStoneLantern(sj_b: ArchBuilder, sj_m: Matrix4, sj_scale = 1): void {
  const sj_s = mul(sj_m, T(0, 0, 0, 0, 0, 0, sj_scale));
  sj_b.add('paint', box(0.7, 0.2, 0.7).translate(0, 0.1, 0), sj_PAL.stoneDark, sj_s);
  sj_b.add('paint', post(0.13, 0.75, 8), sj_PAL.stone, mul(sj_s, T(0, 0.2, 0)));
  sj_b.add('paint', box(0.55, 0.12, 0.55), sj_PAL.stone, mul(sj_s, T(0, 1.0, 0)));
  const sj_window = mul(sj_s, T(0, 1.23, 0));
  sj_b.add('glow', box(0.34, 0.34, 0.34), sj_PAL.paperWarm, sj_window);
  sj_lightPos.setFromMatrixPosition(sj_window);
  sj_b.light({
    x: sj_lightPos.x,
    y: sj_lightPos.y,
    z: sj_lightPos.z,
    size: 0.34 * sj_scale,
    kind: 'stone',
  });
  for (const [sj_x, sj_z] of [
    [-0.19, -0.19],
    [0.19, -0.19],
    [-0.19, 0.19],
    [0.19, 0.19],
  ]) {
    sj_b.add('paint', box(0.07, 0.36, 0.07), sj_PAL.stone, mul(sj_s, T(sj_x!, 1.23, sj_z!)));
  }
  sj_b.add(
    'paint',
    new ConeGeometry(0.5, 0.35, 4).rotateY(Math.PI / 4),
    sj_PAL.stoneDark,
    mul(sj_s, T(0, 1.58, 0)),
  );
  sj_b.add('paint', new SphereGeometry(0.08, 6, 5), sj_PAL.stoneDark, mul(sj_s, T(0, 1.8, 0)));
}
