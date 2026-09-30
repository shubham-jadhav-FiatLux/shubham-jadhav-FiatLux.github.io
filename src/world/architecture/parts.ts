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

/** Architectural palette. */
export const PAL = {
  vermilion: '#a8352a',
  vermilionDark: '#7d2620',
  beamTeal: '#2f6f72',
  beamBlue: '#2f4f7a',
  gold: '#d0a445',
  plaster: '#efe4cf',
  wood: '#5a3a28',
  woodLight: '#8a5f3f',
  stone: '#b3a893',
  stoneDark: '#8e8574',
  tileSlate: '#4a5561',
  tileTeal: '#2f7a6e',
  tileGreen: '#4d7a4a',
  tileGold: '#c99a3a',
  underside: '#6e3326',
  lanternRed: '#e0412b',
  paperWarm: '#ffd9a0',
  bronze: '#6f7f5c',
};

export interface RoofColors {
  tile: string;
  ridge: string;
  under: string;
}

/** Curved hip roof with ridge beam, hip ridges and curled ridge ends. */
export function addHipRoof(
  b: ArchBuilder,
  m: Matrix4,
  halfX: number,
  halfZ: number,
  o: RoofOptions,
  c: RoofColors,
): void {
  const r = hipRoof(halfX, halfZ, o);
  b.add('roof', r.top, c.tile, m);
  b.add('paint', r.under, c.under, m);
  const ridgeLen = r.ridgeTo.x - r.ridgeFrom.x;
  if (ridgeLen > 0.05) {
    b.add('paint', box(ridgeLen + 0.3, 0.2, 0.22), c.ridge, mul(m, T(0, r.ridgeFrom.y + 0.06, 0)));
    for (const sx of [-1, 1]) {
      // upturned "fish tail" ridge ends
      b.add(
        'paint',
        new ConeGeometry(0.12, 0.55, 6),
        c.ridge,
        mul(m, T(sx * (ridgeLen / 2 + 0.2), r.ridgeFrom.y + 0.3, 0, 0, 0, -sx * 0.5)),
      );
    }
  }
  for (const hip of r.hips) b.add('paint', tubeAlong(hip, 0.07, 5), c.ridge, m);
}

/** Polygonal roof (pavilion, pagoda tier). Returns the corners for hanging bells/lanterns. */
export function addPolygonRoof(
  b: ArchBuilder,
  m: Matrix4,
  sides: number,
  radius: number,
  o: RoofOptions,
  c: RoofColors,
  rotation = 0,
): { corners: Vector3[]; topY: number; topRadius: number } {
  const r = polygonRoof(sides, radius, o, rotation);
  b.add('roof', r.top, c.tile, m);
  b.add('paint', r.under, c.under, m);
  for (const hip of r.hips) b.add('paint', tubeAlong(hip, 0.06, 5), c.ridge, m);
  // corner tips
  const corners = r.corners.map((cn) => {
    const tip = new Vector3(cn.x * 1.07, o.lift + 0.05, cn.z * 1.07);
    b.add('paint', new SphereGeometry(0.09, 6, 5), c.ridge, mul(m, T(tip.x, tip.y, tip.z)));
    return tip;
  });
  return { corners, topY: r.topY, topRadius: r.topRadius };
}

/** Gilded finial: stacked rings and a pearl. */
export function addFinial(b: ArchBuilder, m: Matrix4, height: number): void {
  b.add('paint', post(0.1, height * 0.35, 8, 0.08), PAL.gold, m);
  const rings = 5;
  for (let i = 0; i < rings; i++) {
    const y = height * 0.35 + i * height * 0.09;
    b.add(
      'paint',
      new TorusGeometry(0.16 - i * 0.018, 0.035, 5, 12),
      PAL.gold,
      mul(m, T(0, y, 0, Math.PI / 2)),
    );
  }
  b.add('paint', post(0.05, height * 0.55, 6, 0.03), PAL.gold, mul(m, T(0, height * 0.35, 0)));
  b.add('paint', new SphereGeometry(0.14, 10, 8), PAL.gold, mul(m, T(0, height * 0.95, 0)));
}

/** Red lacquered pillar on a stone drum base. */
export function addPillar(
  b: ArchBuilder,
  m: Matrix4,
  radius: number,
  height: number,
  color = PAL.vermilion,
): void {
  b.add(
    'paint',
    new CylinderGeometry(radius * 1.55, radius * 1.7, 0.28, 10).translate(0, 0.14, 0),
    PAL.stone,
    m,
  );
  b.add('paint', post(radius, height, 10, radius * 0.94), color, mul(m, T(0, 0.26, 0)));
  // bracket capital
  b.add('paint', box(radius * 2.6, 0.18, radius * 2.6), PAL.gold, mul(m, T(0, height + 0.2, 0)));
}

/** Painted beam with a teal and gold band (caihua decoration, simplified). */
export function addBeam(
  b: ArchBuilder,
  m: Matrix4,
  length: number,
  height = 0.28,
  depth = 0.24,
): void {
  b.add('paint', box(length, height, depth), PAL.vermilion, m);
  b.add('paint', box(length * 0.72, height * 0.62, depth + 0.02), PAL.beamTeal, m);
  b.add('paint', box(length * 0.3, height * 0.4, depth + 0.04), PAL.gold, m);
}

const lightPos = new Vector3();

/** Red paper lantern (glowing) with dark caps and a tassel. */
export function addLantern(b: ArchBuilder, m: Matrix4, size = 0.32, color = PAL.lanternRed): void {
  const body = new SphereGeometry(size, 14, 12);
  body.scale(1, 1.12, 1);
  b.add('glow', body, color, m);
  lightPos.setFromMatrixPosition(m);
  b.light({ x: lightPos.x, y: lightPos.y, z: lightPos.z, size, kind: 'paper' });
  // thin ribs of the bamboo frame
  for (const y of [-0.55, 0, 0.55]) {
    const r = size * Math.sqrt(1 - y * y) * 1.01;
    b.add(
      'paint',
      new TorusGeometry(r, 0.008 + size * 0.015, 4, 18).rotateX(Math.PI / 2),
      '#3a2416',
      mul(m, T(0, y * size * 1.12, 0)),
    );
  }
  b.add(
    'paint',
    new CylinderGeometry(size * 0.45, size * 0.45, size * 0.18, 10),
    '#2a1a12',
    mul(m, T(0, size * 1.1, 0)),
  );
  b.add(
    'paint',
    new CylinderGeometry(size * 0.45, size * 0.45, size * 0.18, 10),
    '#2a1a12',
    mul(m, T(0, -size * 1.1, 0)),
  );
  b.add('paint', post(0.015, size * 1.2, 4), PAL.gold, mul(m, T(0, -size * 2.35, 0)));
  b.add(
    'paint',
    new ConeGeometry(size * 0.16, size * 0.7, 6),
    PAL.lanternRed,
    mul(m, T(0, -size * 2.2, 0, Math.PI)),
  );
}

/** Stone lantern (for paths and gardens) with a glowing window. */
export function addStoneLantern(b: ArchBuilder, m: Matrix4, scale = 1): void {
  const s = mul(m, T(0, 0, 0, 0, 0, 0, scale));
  b.add('paint', box(0.7, 0.2, 0.7).translate(0, 0.1, 0), PAL.stoneDark, s);
  b.add('paint', post(0.13, 0.75, 8), PAL.stone, mul(s, T(0, 0.2, 0)));
  b.add('paint', box(0.55, 0.12, 0.55), PAL.stone, mul(s, T(0, 1.0, 0)));
  const window = mul(s, T(0, 1.23, 0));
  b.add('glow', box(0.34, 0.34, 0.34), PAL.paperWarm, window);
  lightPos.setFromMatrixPosition(window);
  b.light({ x: lightPos.x, y: lightPos.y, z: lightPos.z, size: 0.34 * scale, kind: 'stone' });
  for (const [x, z] of [
    [-0.19, -0.19],
    [0.19, -0.19],
    [-0.19, 0.19],
    [0.19, 0.19],
  ]) {
    b.add('paint', box(0.07, 0.36, 0.07), PAL.stone, mul(s, T(x!, 1.23, z!)));
  }
  b.add(
    'paint',
    new ConeGeometry(0.5, 0.35, 4).rotateY(Math.PI / 4),
    PAL.stoneDark,
    mul(s, T(0, 1.58, 0)),
  );
  b.add('paint', new SphereGeometry(0.08, 6, 5), PAL.stoneDark, mul(s, T(0, 1.8, 0)));
}

/** Low stone balustrade between two points (local y = 0 is the walking surface). */
export function addBalustrade(
  b: ArchBuilder,
  m: Matrix4,
  from: Vector3,
  to: Vector3,
  height = 0.55,
): void {
  const d = new Vector3().subVectors(to, from);
  const len = d.length();
  const yaw = Math.atan2(d.x, d.z);
  const posts = Math.max(2, Math.round(len / 1.3) + 1);
  for (let i = 0; i < posts; i++) {
    const p = new Vector3().lerpVectors(from, to, i / (posts - 1));
    b.add(
      'paint',
      box(0.14, height, 0.14),
      PAL.stone,
      mul(m, T(p.x, p.y + height / 2, p.z, 0, yaw)),
    );
    b.add(
      'paint',
      new SphereGeometry(0.08, 6, 4),
      PAL.stone,
      mul(m, T(p.x, p.y + height + 0.04, p.z)),
    );
  }
  const mid = new Vector3().lerpVectors(from, to, 0.5);
  b.add(
    'paint',
    box(0.1, 0.1, len),
    PAL.stone,
    mul(m, T(mid.x, mid.y + height - 0.08, mid.z, 0, yaw)),
  );
  b.add(
    'paint',
    box(0.06, 0.06, len),
    PAL.stoneDark,
    mul(m, T(mid.x, mid.y + height * 0.35, mid.z, 0, yaw)),
  );
}
