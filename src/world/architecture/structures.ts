import {
  BoxGeometry,
  CircleGeometry,
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
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mul, T, type ArchBuilder } from './Builder';
import { box, post, tubeAlong } from './geometry';
import {
  addBalustrade,
  addBeam,
  addFinial,
  addHipRoof,
  addLantern,
  addPillar,
  addPolygonRoof,
  addStoneLantern,
  PAL,
} from './parts';
import { createSignboardTexture } from './textures';
import type { CollisionWorld } from '../../physics/CollisionWorld';
import type { HouseDef } from '../layout';
import { WATER_LEVEL } from '../layout';

export interface Placed {
  x: number;
  y: number;
  z: number;
  /** rotation around Y (front faces local +z) */
  rot: number;
}

const toWorld = (p: Placed, lx: number, lz: number) => {
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  return { x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c };
};

/* ------------------------------------------------------------------ Gate */

/** Ceremonial paifang gate with a gilded signboard. Returns the signboard mesh. */
export function buildGate(b: ArchBuilder, col: CollisionWorld, p: Placed, glyphs: string): Mesh {
  const m = T(p.x, p.y, p.z, 0, p.rot);
  const inner = 1.95;
  const outer = 4.7;
  for (const sx of [-1, 1]) {
    addPillar(b, mul(m, T(sx * inner, 0, 0)), 0.24, 5.0);
    addPillar(b, mul(m, T(sx * outer, 0, 0)), 0.2, 3.8);
    // clamping stones either side of each pillar
    for (const x of [inner, outer]) {
      b.add(
        'paint',
        box(0.62, 0.9, 1.1).translate(0, 0.45, 0),
        PAL.stoneDark,
        mul(m, T(sx * x, 0, 0)),
      );
      const w = toWorld(p, sx * x, 0);
      col.box(w.x, w.z, 0.32, 0.56, p.rot, p.y - 1, p.y + 6, 'gate');
    }
    // side spans
    addBeam(b, mul(m, T(sx * 3.32, 3.15, 0)), 2.9, 0.26);
    addBeam(b, mul(m, T(sx * 3.32, 3.7, 0)), 2.9, 0.22);
    addHipRoof(
      b,
      mul(m, T(sx * 3.32, 4.02, 0)),
      1.85,
      0.95,
      { height: 0.72, lift: 0.3, thickness: 0.1 },
      {
        tile: PAL.tileTeal,
        ridge: '#245c54',
        under: PAL.underside,
      },
    );
    // brackets under the eaves
    for (let k = -2; k <= 2; k++) {
      b.add('paint', box(0.18, 0.16, 0.5), PAL.gold, mul(m, T(sx * 3.32 + k * 0.5, 3.93, 0)));
    }
    // hanging lanterns
    addLantern(b, mul(m, T(sx * 1.1, 3.35, 0.12)), 0.26);
    b.add('paint', post(0.012, 0.55, 4), '#2a1a12', mul(m, T(sx * 1.1, 3.62, 0.12)));
  }
  addBeam(b, mul(m, T(0, 4.02, 0)), 4.5, 0.3, 0.26);
  addBeam(b, mul(m, T(0, 5.05, 0)), 4.8, 0.3, 0.28);
  for (let k = -4; k <= 4; k++)
    b.add('paint', box(0.18, 0.18, 0.56), PAL.gold, mul(m, T(k * 0.5, 5.27, 0)));
  addHipRoof(
    b,
    mul(m, T(0, 5.36, 0)),
    3.05,
    1.1,
    { height: 0.9, lift: 0.4, thickness: 0.12 },
    {
      tile: PAL.tileTeal,
      ridge: '#245c54',
      under: PAL.underside,
    },
  );
  // stone lanterns guarding the entrance
  for (const sx of [-1, 1]) addStoneLantern(b, mul(m, T(sx * 6.4, 0, 1.6)), 1.1);
  for (const sx of [-1, 1]) {
    const w = toWorld(p, sx * 6.4, 1.6);
    col.circle(w.x, w.z, 0.45, p.y - 1, p.y + 2, 'lantern');
  }

  // Signboard (its own mesh: unique texture).
  const board = new Mesh(
    new PlaneGeometry(2.35, 0.98),
    new MeshStandardMaterial({
      map: createSignboardTexture(glyphs),
      roughness: 0.45,
      metalness: 0.1,
    }),
  );
  board.position.set(0, 4.54, 0.2);
  const frame = new Mesh(
    new BoxGeometry(2.5, 1.12, 0.12),
    new MeshStandardMaterial({ color: PAL.gold, roughness: 0.4 }),
  );
  frame.position.set(0, 4.54, 0.12);
  const back = board.clone();
  back.rotation.y = Math.PI;
  back.position.z = 0.04;
  const group = new Mesh();
  group.add(frame, board, back);
  group.position.set(p.x, p.y, p.z);
  group.rotation.y = p.rot;
  group.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  group.name = 'gate-signboard';
  return group;
}

/* ---------------------------------------------------------------- Pagoda */

export interface PagodaInfo {
  height: number;
  door: { x: number; z: number };
}

/** Five-tier octagonal pagoda with wind bells and a gilded spire. */
export function buildPagoda(b: ArchBuilder, col: CollisionWorld, p: Placed): PagodaInfo {
  const m = T(p.x, p.y, p.z, 0, p.rot);
  const sides = 8;
  const rot = Math.PI / 8; // flat face towards +z
  // stepped octagonal base
  b.add(
    'paint',
    new CylinderGeometry(6.4, 6.7, 1.2, sides).translate(0, -0.15, 0).rotateY(rot),
    PAL.stoneDark,
    m,
  );
  b.add(
    'paint',
    new CylinderGeometry(5.5, 5.6, 0.45, sides).translate(0, 0.62, 0).rotateY(rot),
    PAL.stone,
    m,
  );
  col.addPlatform({
    shape: { type: 'circle', x: p.x, z: p.z, r: 6.2 },
    top: p.y + 0.45,
    bottom: p.y - 2,
    surface: 'stone',
  });
  col.addPlatform({
    shape: { type: 'circle', x: p.x, z: p.z, r: 5.3 },
    top: p.y + 0.85,
    bottom: p.y - 2,
    surface: 'stone',
  });

  let y = 0.85;
  let r = 3.3;
  let h = 3.4;
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const tm = mul(m, T(0, y, 0));
    // body walls and corner pillars
    b.add(
      'paint',
      new CylinderGeometry(r * 0.97, r, h, sides).translate(0, h / 2, 0).rotateY(rot),
      '#ecdcc2',
      tm,
    );
    for (let k = 0; k < sides; k++) {
      const a = rot + (k / sides) * Math.PI * 2 + Math.PI / sides;
      const cx = Math.cos(a) * r * 1.0;
      const cz = Math.sin(a) * r * 1.0;
      b.add('paint', post(0.13, h, 6), PAL.vermilion, mul(tm, T(cx, 0, cz)));
    }
    // a window (or the door) on each face
    for (let k = 0; k < sides; k++) {
      const fa = (k / sides) * Math.PI * 2;
      const apothem = r * Math.cos(Math.PI / sides) + 0.02;
      const wx = Math.sin(fa) * apothem;
      const wz = Math.cos(fa) * apothem;
      const isDoor = i === 0 && k === 0;
      const ww = isDoor ? 1.4 : 0.9 - i * 0.06;
      const wh = isDoor ? 2.3 : 1.15 - i * 0.08;
      const wy = isDoor ? 1.15 : h * 0.55;
      if (isDoor) {
        b.add('paint', box(ww, wh, 0.08), '#4a2a1b', mul(tm, T(wx, wy, wz, 0, fa)));
        b.add(
          'paint',
          box(ww + 0.25, 0.18, 0.12),
          PAL.vermilion,
          mul(tm, T(wx, wy + wh / 2 + 0.05, wz, 0, fa)),
        );
        b.add(
          'paint',
          new SphereGeometry(0.05, 6, 4),
          PAL.gold,
          mul(tm, T(wx + Math.cos(fa) * 0.12, wy, wz - Math.sin(fa) * 0.12)),
        );
      } else {
        b.add('lattice', new PlaneGeometry(ww, wh), '#ffffff', mul(tm, T(wx, wy, wz, 0, fa)));
        b.add(
          'paint',
          box(ww + 0.16, 0.1, 0.1),
          PAL.vermilion,
          mul(tm, T(wx, wy + wh / 2 + 0.04, wz, 0, fa)),
        );
        b.add(
          'paint',
          box(ww + 0.16, 0.1, 0.1),
          PAL.vermilion,
          mul(tm, T(wx, wy - wh / 2 - 0.04, wz, 0, fa)),
        );
      }
    }
    // beam ring and bracket row
    b.add(
      'paint',
      new CylinderGeometry(r * 1.04, r * 1.04, 0.28, sides).translate(0, h - 0.1, 0).rotateY(rot),
      PAL.beamTeal,
      tm,
    );
    b.add(
      'paint',
      new CylinderGeometry(r * 1.1, r * 1.04, 0.22, sides).translate(0, h + 0.12, 0).rotateY(rot),
      PAL.gold,
      tm,
    );
    const last = i === tiers - 1;
    const overhang = 1.5 - i * 0.14;
    const roof = addPolygonRoof(
      b,
      mul(tm, T(0, h + 0.2, 0)),
      sides,
      (r + overhang) / Math.cos(Math.PI / sides),
      last
        ? { height: 2.6, lift: 0.55, thickness: 0.14 }
        : { height: 1.9 - i * 0.12, lift: 0.5 - i * 0.03, thickness: 0.14, vMax: 0.55 },
      { tile: PAL.tileTeal, ridge: '#1f5a50', under: PAL.underside },
      rot + Math.PI / sides,
    );
    // wind bells hanging from each corner
    for (const c of roof.corners) {
      const bm = mul(tm, T(c.x, h + 0.2 + c.y - 0.28, c.z));
      b.add('paint', post(0.01, 0.18, 4), '#3a2a1c', mul(bm, T(0, 0.02, 0)));
      b.add(
        'paint',
        new CylinderGeometry(0.035, 0.1, 0.18, 8).translate(0, -0.08, 0),
        PAL.gold,
        bm,
      );
      if (i === 0) addLantern(b, mul(bm, T(0, -0.55, 0)), 0.22);
    }
    if (last) {
      addFinial(b, mul(tm, T(0, h + 0.2 + roof.topY - 0.1, 0)), 3.2);
      y += h + 0.2 + roof.topY + 3.2;
    } else {
      y += h + 0.2 + roof.topY - 0.25;
      r *= 0.84;
      h *= 0.86;
    }
  }
  col.circle(p.x, p.z, 3.35, p.y, p.y + 30, 'pagoda');
  // stone lanterns at the front corners of the base
  for (const sx of [-1, 1]) {
    addStoneLantern(b, mul(m, T(sx * 4.2, 0.85, 3.6)), 0.9);
    const w = toWorld(p, sx * 4.2, 3.6);
    col.circle(w.x, w.z, 0.4, p.y, p.y + 3, 'lantern');
  }
  const door = toWorld(p, 0, 3.6);
  return { height: y, door };
}

/* -------------------------------------------------------------- Pavilion */

/** Hexagonal tea pavilion on a stone platform over the water. */
export function buildPavilion(
  b: ArchBuilder,
  col: CollisionWorld,
  p: Placed,
): { table: { x: number; y: number; z: number } } {
  const deck = WATER_LEVEL + 0.62;
  const m = T(p.x, deck, p.z, 0, p.rot);
  const sides = 6;
  const pr = 3.9;
  b.add(
    'paint',
    new CylinderGeometry(pr, pr + 0.25, 2.6, sides).translate(0, -1.3, 0),
    PAL.stone,
    m,
  );
  b.add(
    'paint',
    new CylinderGeometry(pr + 0.06, pr + 0.06, 0.12, sides).translate(0, -0.05, 0),
    PAL.stoneDark,
    m,
  );
  col.addPlatform({
    shape: { type: 'circle', x: p.x, z: p.z, r: pr - 0.1 },
    top: deck,
    bottom: deck - 3,
    surface: 'stone',
  });
  const pillarR = 3.2;
  const corners: Vector3[] = [];
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * Math.PI * 2;
    const c = new Vector3(Math.cos(a) * pillarR, 0, Math.sin(a) * pillarR);
    corners.push(c);
    addPillar(b, mul(m, T(c.x, 0, c.z)), 0.16, 2.75);
    const w = toWorld(p, c.x, c.z);
    col.circle(w.x, w.z, 0.2, deck - 0.2, deck + 3, 'pillar');
  }
  // ring beams and benches ("beauty's rest" backrests) on four sides
  for (let k = 0; k < sides; k++) {
    const a0 = corners[k]!;
    const a1 = corners[(k + 1) % sides]!;
    const mid = new Vector3().lerpVectors(a0, a1, 0.5);
    const len = a0.distanceTo(a1);
    const yaw = Math.atan2(a1.x - a0.x, a1.z - a0.z) + Math.PI / 2;
    addBeam(b, mul(m, T(mid.x, 2.95, mid.z, 0, yaw)), len - 0.2, 0.26, 0.2);
    // hanging lattice fringe under the beam
    b.add(
      'lattice',
      new PlaneGeometry(len - 0.4, 0.35),
      '#ffffff',
      mul(m, T(mid.x * 0.99, 2.62, mid.z * 0.99, 0, yaw)),
    );
    const open = k === 3 || k === 0; // entrances: towards the shore and towards the lake
    if (!open) {
      const inward = mid.clone().multiplyScalar(0.93);
      b.add(
        'paint',
        box(len - 0.45, 0.1, 0.45),
        PAL.woodLight,
        mul(m, T(inward.x, 0.45, inward.z, 0, yaw)),
      );
      b.add(
        'paint',
        box(len - 0.45, 0.45, 0.06),
        PAL.vermilion,
        mul(m, T(mid.x * 1.0, 0.72, mid.z * 1.0, -0.35, yaw)),
      );
      const w = toWorld(p, inward.x, inward.z);
      col.box(w.x, w.z, (len - 0.45) / 2, 0.28, p.rot + yaw, deck - 0.2, deck + 0.55, 'bench');
    }
  }
  const roof = addPolygonRoof(
    b,
    mul(m, T(0, 3.15, 0)),
    sides,
    4.7,
    { height: 2.5, lift: 0.6, thickness: 0.14 },
    { tile: PAL.tileSlate, ridge: '#333b44', under: PAL.underside },
  );
  addFinial(b, mul(m, T(0, 3.15 + roof.topY - 0.1, 0)), 1.4);
  for (const [i, c] of roof.corners.entries()) {
    if (i % 2 === 0) addLantern(b, mul(m, T(c.x * 0.93, 3.15 + c.y - 0.75, c.z * 0.93)), 0.2);
  }
  // stone table with stools and a tea set
  b.add('paint', new CylinderGeometry(0.62, 0.45, 0.72, 16).translate(0, 0.36, 0), PAL.stone, m);
  b.add('paint', new CylinderGeometry(0.7, 0.7, 0.08, 20).translate(0, 0.76, 0), PAL.stoneDark, m);
  col.circle(p.x, p.z, 0.7, deck - 0.2, deck + 0.8, 'table');
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    b.add(
      'paint',
      new CylinderGeometry(0.22, 0.26, 0.45, 12).translate(0, 0.225, 0),
      PAL.stone,
      mul(m, T(Math.cos(a) * 1.15, 0, Math.sin(a) * 1.15)),
    );
  }
  const teapot = new SphereGeometry(0.13, 14, 10);
  teapot.scale(1, 0.8, 1);
  b.add('paint', teapot, '#cfe3dc', mul(m, T(-0.15, 0.9, 0.05)));
  b.add(
    'paint',
    new CylinderGeometry(0.02, 0.03, 0.16, 6),
    '#cfe3dc',
    mul(m, T(-0.02, 0.93, 0.05, 0, 0, -1.0)),
  );
  b.add('paint', new TorusGeometry(0.06, 0.012, 5, 10), '#cfe3dc', mul(m, T(-0.29, 0.92, 0.05)));
  for (const [x, z] of [
    [0.22, -0.18],
    [0.25, 0.2],
  ]) {
    b.add(
      'paint',
      new CylinderGeometry(0.045, 0.035, 0.06, 10).translate(0, 0.03, 0),
      '#f3efe4',
      mul(m, T(x!, 0.8, z!)),
    );
  }
  return { table: { x: p.x, y: deck + 0.8, z: p.z } };
}

/* ---------------------------------------------------------------- Houses */

export function buildHouse(b: ArchBuilder, col: CollisionWorld, def: HouseDef, y: number): void {
  const m = T(def.x, y, def.z, 0, def.rot);
  const w = def.width;
  const d = def.depth;
  const wallH = def.style === 'hall' ? 3.4 : 3.0;
  const plinth = 0.35;
  b.add(
    'paint',
    box(w + 0.9, plinth + 0.6, d + 0.9).translate(0, (plinth - 0.6) / 2, 0),
    PAL.stone,
    m,
  );
  col.addPlatform({
    shape: { type: 'box', x: def.x, z: def.z, hx: (w + 0.9) / 2, hz: (d + 0.9) / 2, rot: def.rot },
    top: y + plinth,
    bottom: y - 1,
    surface: 'stone',
  });
  col.box(def.x, def.z, w / 2 + 0.05, d / 2 + 0.05, def.rot, y, y + 5, 'house');
  const wm = mul(m, T(0, plinth, 0));
  b.add('paint', box(w, wallH, d).translate(0, wallH / 2, 0), PAL.plaster, wm);
  // timber frame
  const frame = def.style === 'hall' ? PAL.vermilion : PAL.wood;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1])
      b.add(
        'paint',
        box(0.2, wallH, 0.2).translate(0, wallH / 2, 0),
        frame,
        mul(wm, T((sx * w) / 2, 0, (sz * d) / 2)),
      );
  }
  for (const sz of [-1, 1]) {
    b.add('paint', box(w + 0.1, 0.18, 0.1), frame, mul(wm, T(0, wallH - 0.1, (sz * d) / 2 + 0.03)));
    b.add('paint', box(w + 0.1, 0.12, 0.08), frame, mul(wm, T(0, 1.0, (sz * d) / 2 + 0.03)));
  }
  for (const sx of [-1, 1]) {
    b.add('paint', box(0.1, 0.18, d + 0.1), frame, mul(wm, T((sx * w) / 2 + 0.03, wallH - 0.1, 0)));
    b.add(
      'lattice',
      new PlaneGeometry(d * 0.45, 1.0),
      '#ffffff',
      mul(wm, T((sx * w) / 2 + 0.04, 1.75, 0, 0, (sx * Math.PI) / 2)),
    );
  }
  // front: door flanked by lattice windows; back: two windows
  b.add(
    'paint',
    box(1.3, 2.15, 0.1).translate(0, 1.075, 0),
    '#4a2a1b',
    mul(wm, T(0, 0, d / 2 + 0.02)),
  );
  b.add('paint', box(1.6, 0.16, 0.14), frame, mul(wm, T(0, 2.25, d / 2 + 0.04)));
  for (const sx of [-1, 1]) {
    b.add(
      'lattice',
      new PlaneGeometry(1.1, 1.0),
      '#ffffff',
      mul(wm, T(sx * (w / 2 - 1.05), 1.75, d / 2 + 0.04)),
    );
    b.add(
      'lattice',
      new PlaneGeometry(1.1, 1.0),
      '#ffffff',
      mul(wm, T(sx * (w / 2 - 1.3), 1.75, -d / 2 - 0.04, 0, Math.PI)),
    );
  }
  if (def.style === 'hall') {
    // porch with red columns
    for (const sx of [-1.5, -0.5, 0.5, 1.5])
      addPillar(b, mul(wm, T(sx * (w / 4), 0, d / 2 + 1.2)), 0.14, wallH - 0.2);
  }
  const roofColor = def.style === 'house' ? PAL.tileSlate : PAL.tileTeal;
  addHipRoof(
    b,
    mul(wm, T(0, wallH + 0.05, 0)),
    w / 2 + (def.style === 'hall' ? 1.3 : 0.95),
    d / 2 + (def.style === 'hall' ? 1.9 : 0.95),
    { height: def.style === 'hall' ? 2.2 : 1.8, lift: 0.45, thickness: 0.12 },
    { tile: roofColor, ridge: '#2f363d', under: PAL.underside },
  );
  // lanterns by the door
  for (const sx of [-1, 1]) {
    addLantern(b, mul(wm, T(sx * 0.95, wallH - 0.55, d / 2 + 0.55)), 0.2);
    b.add(
      'paint',
      post(0.012, 0.35, 4),
      '#2a1a12',
      mul(wm, T(sx * 0.95, wallH - 0.25, d / 2 + 0.55)),
    );
  }
}

/* ---------------------------------------------------------------- Bridge */

export interface BridgeInfo {
  /** outer-corner positions of each bend (for milestone lanterns), shore to shore */
  milestones: { x: number; y: number; z: number }[];
  deckY: number;
}

/** Zig-zag stone bridge with balustrades, piers and landings at each bend. */
export function buildBridge(
  b: ArchBuilder,
  col: CollisionWorld,
  points: readonly (readonly [number, number])[],
  ground: (x: number, z: number) => number,
): BridgeInfo {
  const deckY = WATER_LEVEL + 0.62;
  const halfW = 1.1;
  const id = T();
  const pts = points.map(([x, z]) => new Vector3(x, deckY, z));
  const milestones: BridgeInfo['milestones'] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const c = pts[i + 1]!;
    const dir = new Vector3().subVectors(c, a);
    const len = dir.length();
    dir.normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    const mid = new Vector3().lerpVectors(a, c, 0.5);
    b.add(
      'paint',
      box(halfW * 2, 0.32, len + 0.4),
      PAL.stone,
      mul(id, T(mid.x, deckY - 0.16, mid.z, 0, yaw)),
    );
    // slab joints
    const slabs = Math.max(2, Math.round(len / 1.2));
    for (let k = 1; k < slabs; k++) {
      const p = new Vector3().lerpVectors(a, c, k / slabs);
      b.add(
        'paint',
        box(halfW * 2 + 0.02, 0.02, 0.05),
        PAL.stoneDark,
        mul(id, T(p.x, deckY + 0.002, p.z, 0, yaw)),
      );
    }
    col.addPlatform({
      shape: { type: 'box', x: mid.x, z: mid.z, hx: halfW, hz: len / 2 + 0.2, rot: yaw },
      top: deckY,
      bottom: deckY - 0.45,
      surface: 'stone',
    });
    // balustrades (left and right), leaving the bends open
    const side = new Vector3(dir.z, 0, -dir.x);
    for (const s of [-1, 1]) {
      const from = a
        .clone()
        .addScaledVector(dir, i === 0 ? 1.0 : 1.35)
        .addScaledVector(side, s * (halfW - 0.08));
      const to = c
        .clone()
        .addScaledVector(dir, i === pts.length - 2 ? -1.0 : -1.35)
        .addScaledVector(side, s * (halfW - 0.08));
      if (from.distanceTo(a) < len - 0.5) {
        addBalustrade(b, id, from, to, 0.55);
        const rm = new Vector3().lerpVectors(from, to, 0.5);
        col.box(rm.x, rm.z, 0.08, from.distanceTo(to) / 2, yaw, deckY + 0.05, deckY + 0.6, 'rail');
      }
    }
    // piers
    const piers = Math.max(1, Math.round(len / 4));
    for (let k = 0; k <= piers; k++) {
      const p = new Vector3().lerpVectors(a, c, k / piers);
      const bottom = Math.min(ground(p.x, p.z), -0.3);
      const hgt = deckY - 0.3 - bottom;
      if (hgt > 0.2)
        b.add(
          'paint',
          new CylinderGeometry(0.42, 0.5, hgt, 10).translate(0, hgt / 2, 0),
          PAL.stoneDark,
          mul(id, T(p.x, bottom, p.z)),
        );
    }
  }
  // landings and milestone corners at every bend
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const prev = pts[i - 1]!;
    const next = pts[i + 1]!;
    b.add(
      'paint',
      box(2.5, 0.34, 2.5),
      PAL.stone,
      mul(id, T(p.x, deckY - 0.17, p.z, 0, Math.atan2(next.x - p.x, next.z - p.z))),
    );
    col.addPlatform({
      shape: { type: 'circle', x: p.x, z: p.z, r: 1.35 },
      top: deckY,
      bottom: deckY - 0.45,
      surface: 'stone',
    });
    // outer corner of the bend: opposite the average of the two segment directions
    const d1 = new Vector3().subVectors(prev, p).normalize();
    const d2 = new Vector3().subVectors(next, p).normalize();
    const outer = d1.add(d2).multiplyScalar(-1);
    if (outer.lengthSq() < 1e-4) outer.set(1, 0, 0);
    outer.normalize();
    milestones.push({ x: p.x + outer.x * 1.05, y: deckY, z: p.z + outer.z * 1.05 });
  }
  // shore ends also get a milestone
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  milestones.unshift({ x: first.x + 1.5, y: deckY, z: first.z + 0.4 });
  milestones.push({ x: last.x - 1.5, y: deckY, z: last.z - 0.4 });
  for (const ms of milestones) {
    addStoneLantern(b, T(ms.x, ms.y, ms.z), 0.75);
    col.circle(ms.x, ms.z, 0.32, ms.y - 0.2, ms.y + 1.6, 'milestone');
  }
  return { milestones, deckY };
}

/* ------------------------------------------------------------ Bell tower */

export interface BellParts {
  bell: Mesh;
  striker: Mesh;
  pivot: Vector3;
}

/** Open bell pavilion with a bronze bell and a hanging log striker (both animated). */
export function buildBellTower(b: ArchBuilder, col: CollisionWorld, p: Placed): BellParts {
  const m = T(p.x, p.y, p.z, 0, p.rot);
  b.add('paint', box(4.6, 0.6, 4.6).translate(0, -0.1, 0), PAL.stone, m);
  col.addPlatform({
    shape: { type: 'box', x: p.x, z: p.z, hx: 2.3, hz: 2.3, rot: p.rot },
    top: p.y + 0.2,
    bottom: p.y - 1,
    surface: 'stone',
  });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addPillar(b, mul(m, T(sx * 1.7, 0.2, sz * 1.7)), 0.16, 3.3);
      const w = toWorld(p, sx * 1.7, sz * 1.7);
      col.circle(w.x, w.z, 0.22, p.y, p.y + 4, 'pillar');
    }
    addBeam(b, mul(m, T(sx * 1.7, 3.6, 0, 0, Math.PI / 2)), 3.6, 0.26, 0.22);
  }
  addBeam(b, mul(m, T(0, 3.6, -1.7)), 3.6, 0.26, 0.22);
  addBeam(b, mul(m, T(0, 3.6, 1.7)), 3.6, 0.26, 0.22);
  addBeam(b, mul(m, T(0, 3.35, 0)), 3.6, 0.3, 0.26);
  addHipRoof(
    b,
    mul(m, T(0, 3.8, 0)),
    2.95,
    2.75,
    { height: 1.6, lift: 0.5, thickness: 0.12 },
    {
      tile: PAL.tileSlate,
      ridge: '#333b44',
      under: PAL.underside,
    },
  );

  const profile = [
    [0.001, 0],
    [0.62, 0.02],
    [0.66, 0.12],
    [0.58, 0.25],
    [0.5, 0.6],
    [0.46, 1.0],
    [0.42, 1.28],
    [0.3, 1.38],
    [0.001, 1.42],
  ].map(([r, y]) => new Vector2(r!, y!));
  const bellGeo = new LatheGeometry(profile, 28);
  bellGeo.translate(0, -1.62, 0);
  const bellMat = new MeshStandardMaterial({
    color: PAL.bronze,
    roughness: 0.38,
    metalness: 0.75,
    side: DoubleSide,
  });
  const bell = new Mesh(bellGeo, bellMat);
  const ring = new Mesh(new TorusGeometry(0.14, 0.05, 8, 16), bellMat);
  ring.position.y = -0.12;
  bell.add(ring);
  for (const yb of [-0.55, -1.2]) {
    const band = new Mesh(
      new TorusGeometry(yb < -1 ? 0.6 : 0.49, 0.025, 6, 32),
      new MeshStandardMaterial({ color: '#c9a454', metalness: 0.8, roughness: 0.3 }),
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = yb;
    bell.add(band);
  }
  const pivot = new Vector3(p.x, p.y + 3.25, p.z);
  bell.position.copy(pivot);
  bell.rotation.y = p.rot;
  bell.castShadow = true;
  bell.name = 'bell';
  col.circle(p.x, p.z, 0.7, p.y + 1.4, p.y + 3.2, 'bell');

  const striker = new Mesh(
    new CylinderGeometry(0.13, 0.13, 1.5, 10).rotateZ(Math.PI / 2),
    new MeshStandardMaterial({ color: PAL.woodLight, roughness: 0.8 }),
  );
  const sp = toWorld(p, 1.35, 0);
  striker.position.set(sp.x, p.y + 2.25, sp.z);
  striker.rotation.y = p.rot;
  striker.castShadow = true;
  striker.name = 'bell-striker';
  // ropes
  for (const s of [-0.5, 0.5]) {
    const rp = toWorld(p, 1.35 + s, 0);
    b.add('paint', post(0.015, 1.0, 4), '#6b5a3a', T(rp.x, p.y + 2.3, rp.z));
  }
  return { bell, striker, pivot };
}

/* -------------------------------------------------------------- Signpost */

export function buildSignpost(
  b: ArchBuilder,
  col: CollisionWorld,
  p: Placed,
  arrows: { yaw: number }[],
  texture: Texture,
): Mesh {
  const m = T(p.x, p.y, p.z);
  b.add('paint', post(0.1, 3.0, 8), PAL.wood, m);
  b.add('paint', new CylinderGeometry(0.22, 0.26, 0.2, 8).translate(0, 0.1, 0), PAL.stoneDark, m);
  col.circle(p.x, p.z, 0.2, p.y, p.y + 3, 'signpost');
  const boards = arrows.length;
  const geos: BufferGeometry[] = [];
  arrows.forEach((a, i) => {
    // a board UV-mapped to its row in the atlas, readable from both sides
    const front = new PlaneGeometry(1.5, 0.3);
    const uv = front.attributes.uv!;
    for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1 - uv.getY(k)) / boards);
    front.translate(0.83, 2.65 - i * 0.36, 0.012);
    const back = front.clone();
    const bu = back.attributes.uv!;
    for (let k = 0; k < bu.count; k++) bu.setX(k, 1 - bu.getX(k));
    const idx = back.index!;
    for (let k = 0; k < idx.count; k += 3) {
      const t = idx.getX(k + 1);
      idx.setX(k + 1, idx.getX(k + 2));
      idx.setX(k + 2, t);
    }
    back.translate(0, 0, -0.024);
    const bn = back.attributes.normal!;
    for (let k = 0; k < bn.count; k++) bn.setZ(k, -1);
    const plank = box(1.52, 0.31, 0.02).translate(0.83, 2.65 - i * 0.36, 0);
    plank.deleteAttribute('uv');
    b.add('paint', plank, PAL.wood, mul(m, T(0, 0, 0, 0, a.yaw - Math.PI / 2)));
    for (const g of [front, back]) geos.push(g.rotateY(a.yaw - Math.PI / 2));
  });
  const merged = mergeGeometries(geos, false)!;
  const mesh = new Mesh(merged, new MeshStandardMaterial({ map: texture, roughness: 0.8 }));
  mesh.position.set(p.x, p.y, p.z);
  mesh.castShadow = true;
  mesh.name = 'signpost-boards';
  return mesh;
}

/* ------------------------------------------------------- Village details */

/** Strings of lanterns across the village street and a few props. */
export function buildVillageDetails(
  b: ArchBuilder,
  col: CollisionWorld,
  ground: (x: number, z: number) => number,
): void {
  for (const x of [16, 27, 38]) {
    const zA = 34.8;
    const zB = 42.2;
    const yA = ground(x, zA);
    const yB = ground(x + 0.6, zB);
    b.add('paint', post(0.09, 4.2, 6), PAL.wood, T(x, yA, zA));
    b.add('paint', post(0.09, 4.2, 6), PAL.wood, T(x + 0.6, yB, zB));
    col.circle(x, zA, 0.15, yA, yA + 4, 'pole');
    col.circle(x + 0.6, zB, 0.15, yB, yB + 4, 'pole');
    const pts: Vector3[] = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      const sag = Math.sin(Math.PI * t) * 0.7;
      pts.push(new Vector3(x + 0.6 * t, yA + (yB - yA) * t + 4.1 - sag, zA + (zB - zA) * t));
    }
    b.add('paint', tubeAlong(pts, 0.015, 4), '#2a1a12', T());
    for (let k = 1; k < 6; k++) {
      const p = pts[Math.round((k / 6) * 12)]!;
      addLantern(b, T(p.x, p.y - 0.35, p.z), 0.17, k % 2 ? PAL.lanternRed : '#e8a23a');
    }
  }
  // barrels, crates and water jars by the houses
  const props: [number, number, 'barrel' | 'crate' | 'jar'][] = [
    [19.2, 33.2, 'barrel'],
    [19.9, 34, 'barrel'],
    [44.2, 33.5, 'crate'],
    [44.9, 32.6, 'crate'],
    [29.2, 43.8, 'jar'],
    [30, 44.3, 'jar'],
    [45.4, 43.9, 'barrel'],
  ];
  for (const [x, z, kind] of props) {
    const y = ground(x, z);
    if (kind === 'barrel') {
      b.add(
        'paint',
        new CylinderGeometry(0.38, 0.38, 0.85, 12).translate(0, 0.42, 0),
        PAL.woodLight,
        T(x, y, z),
      );
      b.add(
        'paint',
        new TorusGeometry(0.385, 0.03, 4, 16).rotateX(Math.PI / 2),
        '#3a2a1c',
        T(x, y + 0.2, z),
      );
      b.add(
        'paint',
        new TorusGeometry(0.385, 0.03, 4, 16).rotateX(Math.PI / 2),
        '#3a2a1c',
        T(x, y + 0.65, z),
      );
      col.circle(x, z, 0.4, y, y + 0.9, 'prop');
    } else if (kind === 'crate') {
      b.add('paint', box(0.7, 0.6, 0.7).translate(0, 0.3, 0), '#9a7050', T(x, y, z, 0, x));
      col.circle(x, z, 0.45, y, y + 0.6, 'prop');
    } else {
      const jar = new LatheGeometry(
        [
          [0.001, 0],
          [0.25, 0.02],
          [0.36, 0.3],
          [0.3, 0.62],
          [0.2, 0.72],
          [0.22, 0.78],
        ].map(([r, yy]) => new Vector2(r!, yy!)),
        14,
      );
      b.add('paint', jar, '#7a4a32', T(x, y, z));
      b.add(
        'paint',
        new CircleGeometry(0.2, 12).rotateX(-Math.PI / 2),
        '#2f4f5a',
        T(x, y + 0.76, z),
      );
      col.circle(x, z, 0.38, y, y + 0.8, 'prop');
    }
  }
}
