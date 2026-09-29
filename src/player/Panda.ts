import {
  BufferAttribute,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  type BufferGeometry,
  type Material,
} from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createFurMaterial } from '../render/materials/furMaterial';

const WHITE = new Color('#f4efe4');
const BLACK = new Color('#242226');

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
  const segments = 40;
  const geo = new LatheGeometry(
    profile.map(([r, y]) => new Vector2(r, y)),
    segments,
  );
  const pos = geo.attributes.position as BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  // LatheGeometry emits (segments + 1) columns of `profile.length` vertices.
  for (let i = 0; i < pos.count; i++) {
    const p = profile[i % profile.length]!;
    const c = p[2] ? BLACK : WHITE;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
    // Slightly flatten front-to-back.
    pos.setZ(i, pos.getZ(i) * 0.9);
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  const merged = mergeVertices(geo);
  merged.computeVertexNormals();
  return merged;
}

function mesh(geo: BufferGeometry, mat: Material, name: string): Mesh {
  const m = new Mesh(geo, mat);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * An original, procedurally modelled panda: soft pear-shaped body, big round head with
 * teardrop eye patches, a red scarf and a bamboo scroll case on its back.
 * The transform hierarchy exposes pivots for the procedural animator.
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
  readonly earL: Mesh;
  readonly earR: Mesh;
  readonly eyeL = new Group();
  readonly eyeR = new Group();
  /** where the scarf tails hang from (used by the ribbon simulation) */
  readonly scarfKnot = new Object3D();
  readonly materials: {
    white: MeshStandardMaterial;
    black: MeshStandardMaterial;
    scarf: MeshStandardMaterial;
  };

  constructor() {
    this.root.name = 'panda';
    const white = createFurMaterial(WHITE, { rim: 0.32 });
    const black = createFurMaterial(BLACK, { rim: 0.45, roughness: 0.8 });
    const torsoMat = createFurMaterial('#ffffff', { rim: 0.32 });
    torsoMat.vertexColors = true;
    const cream = createFurMaterial('#f8f2e4', { rim: 0.25 });
    const scarf = new MeshStandardMaterial({ color: '#c8352c', roughness: 0.75 });
    const scarfDark = new MeshStandardMaterial({ color: '#9e2622', roughness: 0.8 });
    const nose = new MeshStandardMaterial({ color: '#19181a', roughness: 0.28 });
    const eyeWhite = new MeshStandardMaterial({ color: '#fbf8f2', roughness: 0.25 });
    const pupil = new MeshStandardMaterial({ color: '#241710', roughness: 0.12 });
    const shine = new MeshBasicMaterial({ color: '#ffffff' });
    const bamboo = new MeshStandardMaterial({ color: '#c2a45a', roughness: 0.6 });
    const wood = new MeshStandardMaterial({ color: '#5b3a24', roughness: 0.7 });
    this.materials = { white, black, scarf };

    this.root.add(this.body);
    this.body.rotation.order = 'YXZ';

    // --- torso ---
    this.body.add(mesh(createTorsoGeometry(), torsoMat, 'torso'));
    const tail = mesh(new SphereGeometry(0.085, 12, 10), white, 'tail');
    tail.position.set(0, 0.38, -0.37);
    this.body.add(tail);

    // --- legs ---
    const legGeo = new CapsuleGeometry(0.125, 0.12, 6, 14);
    legGeo.translate(0, -0.165, 0);
    const footGeo = new SphereGeometry(0.13, 16, 12);
    footGeo.scale(1, 0.6, 1.28);
    const padGeo = new SphereGeometry(0.075, 12, 8);
    padGeo.scale(1, 0.35, 1.2);
    for (const [leg, side] of [
      [this.legL, 1],
      [this.legR, -1],
    ] as const) {
      leg.position.set(0.195 * side, 0.36, 0.02);
      leg.add(mesh(legGeo, black, 'leg'));
      const foot = mesh(footGeo, black, 'foot');
      foot.position.set(0, -0.285, 0.05);
      leg.add(foot);
      const pad = mesh(padGeo, nose, 'pad');
      pad.position.set(0, -0.33, 0.07);
      leg.add(pad);
      this.body.add(leg);
    }

    // --- arms ---
    const armGeo = new CapsuleGeometry(0.1, 0.24, 6, 14);
    armGeo.translate(0, -0.18, 0);
    const pawGeo = new SphereGeometry(0.108, 14, 10);
    for (const [arm, side] of [
      [this.armL, 1],
      [this.armR, -1],
    ] as const) {
      arm.position.set(0.33 * side, 0.855, 0.03);
      arm.rotation.z = 0.22 * side;
      arm.add(mesh(armGeo, black, 'arm'));
      const paw = mesh(pawGeo, black, 'paw');
      paw.position.set(0, -0.34, 0.01);
      arm.add(paw);
      this.body.add(arm);
    }

    // --- head ---
    this.head.position.set(0, 1.11, 0.03);
    this.body.add(this.head);
    const skull = new SphereGeometry(0.38, 36, 28);
    skull.scale(1.08, 0.94, 1);
    this.head.add(mesh(skull, white, 'skull'));

    const muzzleGeo = new SphereGeometry(0.16, 24, 16);
    muzzleGeo.scale(1.2, 0.82, 0.95);
    const muzzle = mesh(muzzleGeo, cream, 'muzzle');
    muzzle.position.set(0, -0.1, 0.27);
    this.head.add(muzzle);

    const noseGeo = new SphereGeometry(0.058, 16, 12);
    noseGeo.scale(1.35, 0.85, 1);
    const noseMesh = mesh(noseGeo, nose, 'nose');
    noseMesh.position.set(0, -0.04, 0.405);
    this.head.add(noseMesh);

    const mouth = mesh(new TorusGeometry(0.04, 0.009, 6, 16, Math.PI), nose, 'mouth');
    mouth.position.set(0, -0.115, 0.4);
    mouth.rotation.set(-0.35, 0, Math.PI);
    this.head.add(mouth);

    const patchGeo = new SphereGeometry(0.105, 20, 16);
    patchGeo.scale(0.9, 1.32, 0.55);
    const scleraGeo = new SphereGeometry(0.05, 18, 14);
    scleraGeo.scale(1, 1.1, 0.6);
    const pupilGeo = new SphereGeometry(0.036, 16, 12);
    pupilGeo.scale(1, 1.1, 0.7);
    const shineGeo = new SphereGeometry(0.012, 8, 6);
    for (const [eye, side] of [
      [this.eyeL, 1],
      [this.eyeR, -1],
    ] as const) {
      const patch = mesh(patchGeo, black, 'eye-patch');
      patch.position.set(0.142 * side, 0.035, 0.33);
      patch.rotation.set(0.1, 0.38 * side, 0.52 * side);
      this.head.add(patch);

      eye.position.set(0.138 * side, 0.05, 0.372);
      eye.rotation.y = 0.33 * side;
      const sclera = mesh(scleraGeo, eyeWhite, 'sclera');
      eye.add(sclera);
      const p = mesh(pupilGeo, pupil, 'pupil');
      p.position.set(-0.006 * side, 0.002, 0.02);
      eye.add(p);
      const s = new Mesh(shineGeo, shine);
      s.position.set(0.006 * side + 0.004, 0.02, 0.043);
      eye.add(s);
      this.head.add(eye);
    }

    const earGeo = new SphereGeometry(0.12, 18, 14);
    earGeo.scale(1, 1, 0.58);
    this.earL = mesh(earGeo, black, 'ear');
    this.earL.position.set(0.265, 0.27, -0.03);
    this.earL.rotation.z = -0.38;
    this.earR = mesh(earGeo, black, 'ear');
    this.earR.position.set(-0.265, 0.27, -0.03);
    this.earR.rotation.z = 0.38;
    this.head.add(this.earL, this.earR);

    // --- scarf ---
    // The big head sits low (no visible neck), so the scarf wraps the top of the torso.
    const scarfRing = mesh(new TorusGeometry(0.355, 0.068, 12, 40), scarf, 'scarf');
    scarfRing.position.set(0, 0.8, 0.0);
    scarfRing.rotation.set(Math.PI / 2 + 0.12, 0, 0);
    scarfRing.scale.set(1, 0.9, 1);
    this.body.add(scarfRing);
    const knot = mesh(new SphereGeometry(0.08, 14, 10), scarfDark, 'scarf-knot');
    knot.position.set(-0.2, 0.74, 0.29);
    knot.scale.set(1, 0.85, 0.75);
    this.body.add(knot);
    this.scarfKnot.position.set(-0.2, 0.71, 0.31);
    this.body.add(this.scarfKnot);

    // --- scroll case on the back ---
    const caseGroup = new Group();
    caseGroup.position.set(0.02, 0.7, -0.35);
    caseGroup.rotation.set(0.12, 0, 0.72);
    const tube = mesh(new CylinderGeometry(0.075, 0.075, 0.66, 14), bamboo, 'scroll-case');
    caseGroup.add(tube);
    const ringGeo = new TorusGeometry(0.077, 0.012, 6, 16);
    for (const y of [-0.16, 0.12]) {
      const ring = mesh(ringGeo, bamboo, 'node');
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      ring.material = wood;
      caseGroup.add(ring);
    }
    const capGeo = new CylinderGeometry(0.085, 0.085, 0.06, 14);
    for (const y of [-0.34, 0.34]) {
      const cap = mesh(capGeo, wood, 'cap');
      cap.position.y = y;
      caseGroup.add(cap);
    }
    // A rolled scroll peeking out of the top.
    const peek = mesh(new CylinderGeometry(0.05, 0.05, 0.1, 10), cream, 'scroll');
    peek.position.y = 0.41;
    caseGroup.add(peek);
    this.body.add(caseGroup);

    const strap = mesh(new TorusGeometry(0.4, 0.016, 6, 40), wood, 'strap');
    strap.position.set(0, 0.7, 0);
    strap.rotation.set(Math.PI / 2, 0.72, 0);
    strap.scale.set(1, 0.9, 1);
    this.body.add(strap);

    this.root.traverse((o) => {
      if ((o as Mesh).isMesh && (o as Mesh).material === shine) {
        (o as Mesh).castShadow = false;
      }
    });
  }

  /** Material for the simulated scarf tails (double sided ribbons). */
  static createRibbonMaterial(): MeshStandardMaterial {
    return new MeshStandardMaterial({ color: '#c8352c', roughness: 0.75, side: DoubleSide });
  }
}
