import {
  BufferAttribute,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type ColorRepresentation,
  type Material,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createFurMaterial } from '../render/materials/furMaterial';

const WHITE = new Color('#f4efe4');
const CREAM = new Color('#f8f2e4');
const BLACK = new Color('#242226');
const NOSE = new Color('#19181a');
const SCARF = new Color('#c8352c');
const SCARF_DARK = new Color('#9e2622');
const BAMBOO = new Color('#c2a45a');
const WOOD = new Color('#5b3a24');

/**
 * Builds the pear-shaped torso with the panda's black shoulder band baked into vertex
 * colours. Duplicate profile points at the band edges keep the boundary crisp.
 */
function createTorsoGeometry(): BufferGeometry {
  type P = [r: number, y: number, black: boolean];
  const eps = 0.004;
  const profile: P[] = [
    [0.001, 0.25, false],
    [0.17, 0.27, false],
    [0.29, 0.33, false],
    [0.375, 0.42, false],
    [0.42, 0.53, false],
    [0.43, 0.62, false],
    [0.418, 0.69, false],
    [0.398, 0.745, false],
    [0.396, 0.745 + eps, true],
    [0.37, 0.8, true],
    [0.33, 0.87, true],
    [0.28, 0.93, true],
    [0.24, 0.965, true],
    [0.238, 0.965 + eps, false],
    [0.17, 1.01, false],
    [0.001, 1.04, false],
  ];
  const geo = new LatheGeometry(
    profile.map(([r, y]) => new Vector2(r, y)),
    40,
  );
  const pos = geo.attributes.position as BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  // LatheGeometry emits (segments + 1) columns of `profile.length` vertices.
  for (let i = 0; i < pos.count; i++) {
    const c = profile[i % profile.length]![2] ? BLACK : WHITE;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
    pos.setZ(i, pos.getZ(i) * 0.9); // slightly flatter front-to-back
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  const merged = mergeVertices(geo);
  merged.computeVertexNormals();
  return merged;
}

interface Part {
  geo: BufferGeometry;
  color?: ColorRepresentation;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

const m4 = new Matrix4();
const q = new Quaternion();

/** Merges primitive parts into one vertex-coloured geometry (one draw call). */
function bake(parts: Part[]): BufferGeometry {
  const geos = parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    g.deleteAttribute('uv');
    if (!g.attributes.color) {
      const c = new Color(p.color ?? '#ffffff');
      const arr = new Float32Array(g.attributes.position!.count * 3);
      for (let i = 0; i < arr.length; i += 3) arr.set([c.r, c.g, c.b], i);
      g.setAttribute('color', new BufferAttribute(arr, 3));
    }
    q.setFromEuler(new Euler(...(p.rotation ?? [0, 0, 0])));
    m4.compose(
      new Vector3(...(p.position ?? [0, 0, 0])),
      q,
      new Vector3(...(p.scale ?? [1, 1, 1])),
    );
    g.applyMatrix4(m4);
    return g;
  });
  const merged = mergeGeometries(geos, false)!;
  geos.forEach((g) => g.dispose());
  return merged;
}

function meshOf(geo: BufferGeometry, mat: Material, name: string, shadow = true): Mesh {
  const m = new Mesh(geo, mat);
  m.name = name;
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/**
 * An original, procedurally modelled panda: soft pear-shaped body, big round head with
 * teardrop eye patches, a red scarf and a bamboo scroll case on its back.
 * Parts that move together are baked into single vertex-coloured meshes (about ten draw
 * calls for the whole character); the group hierarchy exposes pivots for the animator.
 */
export class Panda {
  readonly root = new Group();
  /** bob / lean / squash pivot at the feet */
  readonly body = new Group();
  readonly head = new Group();
  readonly armL = new Group();
  readonly armR = new Group();
  readonly legL = new Group();
  readonly legR = new Group();
  readonly earL = new Group();
  readonly earR = new Group();
  readonly eyeL = new Group();
  readonly eyeR = new Group();
  /** where the scarf tails hang from (used by the ribbon simulation) */
  readonly scarfKnot = new Object3D();

  constructor() {
    this.root.name = 'panda';
    const fur = createFurMaterial('#ffffff', { rim: 0.34 });
    fur.vertexColors = true;
    const gloss = new MeshStandardMaterial({ vertexColors: true, roughness: 0.18 });

    this.root.add(this.body);
    this.body.rotation.order = 'YXZ';

    // --- body: torso, tail, scarf, scroll case, strap ---
    const caseMatrix = new Matrix4().compose(
      new Vector3(0.02, 0.7, -0.35),
      new Quaternion().setFromEuler(new Euler(0.12, 0, 0.72)),
      new Vector3(1, 1, 1),
    );
    const scrollCase = bake([
      { geo: new CylinderGeometry(0.075, 0.075, 0.66, 14), color: BAMBOO },
      {
        geo: new TorusGeometry(0.077, 0.012, 6, 16),
        color: WOOD,
        position: [0, -0.16, 0],
        rotation: [Math.PI / 2, 0, 0],
      },
      {
        geo: new TorusGeometry(0.077, 0.012, 6, 16),
        color: WOOD,
        position: [0, 0.12, 0],
        rotation: [Math.PI / 2, 0, 0],
      },
      { geo: new CylinderGeometry(0.085, 0.085, 0.06, 14), color: WOOD, position: [0, -0.34, 0] },
      { geo: new CylinderGeometry(0.085, 0.085, 0.06, 14), color: WOOD, position: [0, 0.34, 0] },
      { geo: new CylinderGeometry(0.05, 0.05, 0.1, 10), color: CREAM, position: [0, 0.41, 0] },
    ]).applyMatrix4(caseMatrix);
    const bodyGeo = mergeGeometries([
      createTorsoGeometry().toNonIndexed(),
      bake([
        { geo: new SphereGeometry(0.085, 12, 10), color: WHITE, position: [0, 0.38, -0.37] },
        {
          geo: new TorusGeometry(0.355, 0.068, 12, 40),
          color: SCARF,
          position: [0, 0.8, 0],
          rotation: [Math.PI / 2 + 0.12, 0, 0],
          scale: [1, 0.9, 1],
        },
        {
          geo: new SphereGeometry(0.08, 14, 10),
          color: SCARF_DARK,
          position: [-0.2, 0.74, 0.29],
          scale: [1, 0.85, 0.75],
        },
        {
          geo: new TorusGeometry(0.4, 0.016, 6, 40),
          color: WOOD,
          position: [0, 0.7, 0],
          rotation: [Math.PI / 2, 0.72, 0],
          scale: [1, 0.9, 1],
        },
      ]),
      scrollCase,
    ])!;
    this.body.add(meshOf(bodyGeo, fur, 'panda-body'));
    this.scarfKnot.position.set(-0.2, 0.71, 0.31);
    this.body.add(this.scarfKnot);

    // --- legs ---
    const legGeo = bake([
      { geo: new CapsuleGeometry(0.125, 0.12, 6, 14), color: BLACK, position: [0, -0.165, 0] },
      {
        geo: new SphereGeometry(0.13, 16, 12),
        color: BLACK,
        position: [0, -0.285, 0.05],
        scale: [1, 0.6, 1.28],
      },
      {
        geo: new SphereGeometry(0.075, 12, 8),
        color: NOSE,
        position: [0, -0.33, 0.07],
        scale: [1, 0.35, 1.2],
      },
    ]);
    for (const [leg, side] of [
      [this.legL, 1],
      [this.legR, -1],
    ] as const) {
      leg.position.set(0.195 * side, 0.36, 0.02);
      leg.add(meshOf(legGeo, fur, 'panda-leg'));
      this.body.add(leg);
    }

    // --- arms ---
    const armGeo = bake([
      { geo: new CapsuleGeometry(0.1, 0.24, 6, 14), color: BLACK, position: [0, -0.18, 0] },
      { geo: new SphereGeometry(0.108, 14, 10), color: BLACK, position: [0, -0.34, 0.01] },
    ]);
    for (const [arm, side] of [
      [this.armL, 1],
      [this.armR, -1],
    ] as const) {
      arm.position.set(0.33 * side, 0.855, 0.03);
      arm.rotation.z = 0.22 * side;
      arm.add(meshOf(armGeo, fur, 'panda-arm'));
      this.body.add(arm);
    }

    // --- head ---
    this.head.position.set(0, 1.11, 0.03);
    this.body.add(this.head);
    const patch = (side: number): Part => ({
      geo: new SphereGeometry(0.105, 20, 16),
      color: BLACK,
      position: [0.142 * side, 0.035, 0.33],
      rotation: [0.1, 0.38 * side, 0.52 * side],
      scale: [0.9, 1.32, 0.55],
    });
    const headGeo = bake([
      { geo: new SphereGeometry(0.38, 36, 28), color: WHITE, scale: [1.08, 0.94, 1] },
      {
        geo: new SphereGeometry(0.16, 24, 16),
        color: CREAM,
        position: [0, -0.1, 0.27],
        scale: [1.2, 0.82, 0.95],
      },
      {
        geo: new SphereGeometry(0.058, 16, 12),
        color: NOSE,
        position: [0, -0.04, 0.405],
        scale: [1.35, 0.85, 1],
      },
      {
        geo: new TorusGeometry(0.04, 0.009, 6, 16, Math.PI),
        color: NOSE,
        position: [0, -0.115, 0.4],
        rotation: [-0.35, 0, Math.PI],
      },
      patch(1),
      patch(-1),
    ]);
    this.head.add(meshOf(headGeo, fur, 'panda-head'));

    const earGeo = bake([
      { geo: new SphereGeometry(0.12, 18, 14), color: BLACK, scale: [1, 1, 0.58] },
    ]);
    for (const [ear, side] of [
      [this.earL, 1],
      [this.earR, -1],
    ] as const) {
      ear.position.set(0.265 * side, 0.27, -0.03);
      ear.rotation.z = -0.38 * side;
      ear.add(meshOf(earGeo, fur, 'panda-ear'));
      this.head.add(ear);
    }

    for (const [eye, side] of [
      [this.eyeL, 1],
      [this.eyeR, -1],
    ] as const) {
      const eyeGeo = bake([
        { geo: new SphereGeometry(0.05, 18, 14), color: '#fbf8f2', scale: [1, 1.1, 0.6] },
        {
          geo: new SphereGeometry(0.036, 16, 12),
          color: '#241710',
          position: [-0.006 * side, 0.002, 0.02],
          scale: [1, 1.1, 0.7],
        },
        {
          geo: new SphereGeometry(0.012, 8, 6),
          color: '#ffffff',
          position: [0.006 * side + 0.004, 0.02, 0.043],
        },
      ]);
      eye.position.set(0.138 * side, 0.05, 0.372);
      eye.rotation.y = 0.33 * side;
      eye.add(meshOf(eyeGeo, gloss, 'panda-eye', false));
      this.head.add(eye);
    }
  }

  /** Material for the simulated scarf tails (double sided ribbons). */
  static createRibbonMaterial(): MeshStandardMaterial {
    return new MeshStandardMaterial({ color: SCARF, roughness: 0.75, side: DoubleSide });
  }
}
