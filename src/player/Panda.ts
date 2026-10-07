import {
  BufferAttribute,
  CapsuleGeometry,
  Color,
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
import {
  createGearGeometry,
  createScarfGeometry,
  createScarfMaterial,
  createTailMaterial,
} from './pandaGear';

const sj_WHITE = new Color('#f4efe4');
const sj_CREAM = new Color('#f8f2e4');
const sj_BLACK = new Color('#242226');
const sj_NOSE = new Color('#19181a');

/**
 * Builds the pear-shaped torso with the panda's black shoulder band baked into vertex
 * colours. Duplicate profile points at the band edges keep the boundary crisp. (The scarf
 * follows this profile round the neck: `NECK` in `pandaGear.ts`.)
 */
function createTorsoGeometry(): BufferGeometry {
  type P = [r: number, y: number, black: boolean];
  const sj_eps = 0.004;
  const sj_profile: P[] = [
    [0.001, 0.25, false],
    [0.17, 0.27, false],
    [0.29, 0.33, false],
    [0.375, 0.42, false],
    [0.42, 0.53, false],
    [0.43, 0.62, false],
    [0.418, 0.69, false],
    [0.398, 0.745, false],
    [0.396, 0.745 + sj_eps, true],
    [0.37, 0.8, true],
    [0.33, 0.87, true],
    [0.28, 0.93, true],
    [0.24, 0.965, true],
    [0.238, 0.965 + sj_eps, false],
    [0.17, 1.01, false],
    [0.001, 1.04, false],
  ];
  const sj_geo = new LatheGeometry(
    sj_profile.map(([sj_r, sj_y]) => new Vector2(sj_r, sj_y)),
    40,
  );
  const sj_pos = sj_geo.attributes.position as BufferAttribute;
  const sj_colors = new Float32Array(sj_pos.count * 3);
  // LatheGeometry emits (segments + 1) columns of `profile.length` vertices.
  for (let sj_i = 0; sj_i < sj_pos.count; sj_i++) {
    const sj_c = sj_profile[sj_i % sj_profile.length]![2] ? sj_BLACK : sj_WHITE;
    sj_colors[sj_i * 3] = sj_c.r;
    sj_colors[sj_i * 3 + 1] = sj_c.g;
    sj_colors[sj_i * 3 + 2] = sj_c.b;
    sj_pos.setZ(sj_i, sj_pos.getZ(sj_i) * 0.9); // slightly flatter front-to-back
  }
  sj_geo.setAttribute('color', new BufferAttribute(sj_colors, 3));
  sj_geo.deleteAttribute('uv');
  sj_geo.deleteAttribute('normal');
  const sj_merged = mergeVertices(sj_geo);
  sj_merged.computeVertexNormals();
  return sj_merged;
}

interface Part {
  geo: BufferGeometry;
  color?: ColorRepresentation;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

const sj_m4 = new Matrix4();
const sj_q = new Quaternion();

/** Merges primitive parts into one vertex-coloured geometry (one draw call). */
function bake(sj_parts: Part[]): BufferGeometry {
  const sj_geos = sj_parts.map((sj_p) => {
    const sj_g = sj_p.geo.index ? sj_p.geo.toNonIndexed() : sj_p.geo.clone();
    sj_g.deleteAttribute('uv');
    if (!sj_g.attributes.color) {
      const sj_c = new Color(sj_p.color ?? '#ffffff');
      const sj_arr = new Float32Array(sj_g.attributes.position!.count * 3);
      for (let sj_i = 0; sj_i < sj_arr.length; sj_i += 3)
        sj_arr.set([sj_c.r, sj_c.g, sj_c.b], sj_i);
      sj_g.setAttribute('color', new BufferAttribute(sj_arr, 3));
    }
    sj_q.setFromEuler(new Euler(...(sj_p.rotation ?? [0, 0, 0])));
    sj_m4.compose(
      new Vector3(...(sj_p.position ?? [0, 0, 0])),
      sj_q,
      new Vector3(...(sj_p.scale ?? [1, 1, 1])),
    );
    sj_g.applyMatrix4(sj_m4);
    return sj_g;
  });
  const sj_merged = mergeGeometries(sj_geos, false)!;
  sj_geos.forEach((sj_g) => sj_g.dispose());
  return sj_merged;
}

function meshOf(sj_geo: BufferGeometry, sj_mat: Material, sj_name: string, sj_shadow = true): Mesh {
  const sj_m = new Mesh(sj_geo, sj_mat);
  sj_m.name = sj_name;
  sj_m.castShadow = sj_shadow;
  sj_m.receiveShadow = true;
  return sj_m;
}

/**
 * An original, procedurally modelled panda: soft pear-shaped body, big round head with
 * teardrop eye patches, a silk scarf and a bamboo scroll case slung across its back.
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
    const sj_fur = createFurMaterial('#ffffff', { rim: 0.34 });
    sj_fur.vertexColors = true;
    const sj_gloss = new MeshStandardMaterial({ vertexColors: true, roughness: 0.18 });

    this.root.add(this.body);
    this.body.rotation.order = 'YXZ';

    // --- body: torso and tail; the scarf, the scroll case and its strap ---
    const sj_bodyGeo = mergeGeometries([
      createTorsoGeometry().toNonIndexed(),
      bake([
        { geo: new SphereGeometry(0.085, 12, 10), color: sj_WHITE, position: [0, 0.38, -0.37] },
      ]),
    ])!;
    this.body.add(meshOf(sj_bodyGeo, sj_fur, 'panda-body'));
    this.scarfKnot.position.set(-0.2, 0.71, 0.31);
    this.body.add(this.scarfKnot);
    this.body.add(
      meshOf(createScarfGeometry(this.scarfKnot.position), createScarfMaterial(), 'panda-scarf'),
    );
    const sj_caseMatrix = new Matrix4().compose(
      new Vector3(0.02, 0.7, -0.35),
      new Quaternion().setFromEuler(new Euler(0.12, 0, 0.72)),
      new Vector3(1, 1, 1),
    );
    this.body.add(
      meshOf(
        createGearGeometry(sj_caseMatrix),
        new MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05 }),
        'panda-gear',
      ),
    );

    // --- legs ---
    const sj_legGeo = bake([
      { geo: new CapsuleGeometry(0.125, 0.12, 6, 14), color: sj_BLACK, position: [0, -0.165, 0] },
      {
        geo: new SphereGeometry(0.13, 16, 12),
        color: sj_BLACK,
        position: [0, -0.285, 0.05],
        scale: [1, 0.6, 1.28],
      },
      {
        geo: new SphereGeometry(0.075, 12, 8),
        color: sj_NOSE,
        position: [0, -0.33, 0.07],
        scale: [1, 0.35, 1.2],
      },
    ]);
    for (const [sj_leg, sj_side] of [
      [this.legL, 1],
      [this.legR, -1],
    ] as const) {
      sj_leg.position.set(0.195 * sj_side, 0.36, 0.02);
      sj_leg.add(meshOf(sj_legGeo, sj_fur, 'panda-leg'));
      this.body.add(sj_leg);
    }

    // --- arms ---
    const sj_armGeo = bake([
      { geo: new CapsuleGeometry(0.1, 0.24, 6, 14), color: sj_BLACK, position: [0, -0.18, 0] },
      { geo: new SphereGeometry(0.108, 14, 10), color: sj_BLACK, position: [0, -0.34, 0.01] },
    ]);
    for (const [sj_arm, sj_side] of [
      [this.armL, 1],
      [this.armR, -1],
    ] as const) {
      sj_arm.position.set(0.33 * sj_side, 0.855, 0.03);
      sj_arm.rotation.z = 0.22 * sj_side;
      sj_arm.add(meshOf(sj_armGeo, sj_fur, 'panda-arm'));
      this.body.add(sj_arm);
    }

    // --- head ---
    this.head.position.set(0, 1.11, 0.03);
    this.body.add(this.head);
    const sj_patch = (sj_side: number): Part => ({
      geo: new SphereGeometry(0.105, 20, 16),
      color: sj_BLACK,
      position: [0.142 * sj_side, 0.035, 0.33],
      rotation: [0.1, 0.38 * sj_side, 0.52 * sj_side],
      scale: [0.9, 1.32, 0.55],
    });
    const sj_headGeo = bake([
      { geo: new SphereGeometry(0.38, 36, 28), color: sj_WHITE, scale: [1.08, 0.94, 1] },
      {
        geo: new SphereGeometry(0.16, 24, 16),
        color: sj_CREAM,
        position: [0, -0.1, 0.27],
        scale: [1.2, 0.82, 0.95],
      },
      {
        geo: new SphereGeometry(0.058, 16, 12),
        color: sj_NOSE,
        position: [0, -0.04, 0.405],
        scale: [1.35, 0.85, 1],
      },
      {
        geo: new TorusGeometry(0.04, 0.009, 6, 16, Math.PI),
        color: sj_NOSE,
        position: [0, -0.115, 0.4],
        rotation: [-0.35, 0, Math.PI],
      },
      sj_patch(1),
      sj_patch(-1),
    ]);
    this.head.add(meshOf(sj_headGeo, sj_fur, 'panda-head'));

    const sj_earGeo = bake([
      { geo: new SphereGeometry(0.12, 18, 14), color: sj_BLACK, scale: [1, 1, 0.58] },
    ]);
    for (const [sj_ear, sj_side] of [
      [this.earL, 1],
      [this.earR, -1],
    ] as const) {
      sj_ear.position.set(0.265 * sj_side, 0.27, -0.03);
      sj_ear.rotation.z = -0.38 * sj_side;
      sj_ear.add(meshOf(sj_earGeo, sj_fur, 'panda-ear'));
      this.head.add(sj_ear);
    }

    for (const [sj_eye, sj_side] of [
      [this.eyeL, 1],
      [this.eyeR, -1],
    ] as const) {
      const sj_eyeGeo = bake([
        { geo: new SphereGeometry(0.05, 18, 14), color: '#fbf8f2', scale: [1, 1.1, 0.6] },
        {
          geo: new SphereGeometry(0.036, 16, 12),
          color: '#241710',
          position: [-0.006 * sj_side, 0.002, 0.02],
          scale: [1, 1.1, 0.7],
        },
        {
          geo: new SphereGeometry(0.012, 8, 6),
          color: '#ffffff',
          position: [0.006 * sj_side + 0.004, 0.02, 0.043],
        },
      ]);
      sj_eye.position.set(0.138 * sj_side, 0.05, 0.372);
      sj_eye.rotation.y = 0.33 * sj_side;
      sj_eye.add(meshOf(sj_eyeGeo, sj_gloss, 'panda-eye', false));
      this.head.add(sj_eye);
    }
  }

  /** Material for the simulated scarf tails: silk with gold hems and fringed ends. */
  static createRibbonMaterial(): Material {
    return createTailMaterial();
  }
}
