import {
  BufferAttribute,
  Color,
  ConeGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { growTree, type TreeKind, type TreeModel } from './treeGeometry';
import { createVegetationMaterial } from './vegetationMaterial';
import { chunkedInstances } from './instancing';
import {
  createBlossomTexture,
  createLeafTexture,
  createPineTexture,
  createWillowTexture,
} from './textures';

export interface TreeInstance {
  kind: TreeKind;
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
  /** force a specific variant (e.g. the hero tree) */
  variant?: number;
}

const VARIANTS = 3;
const SEEDS: Record<TreeKind, number[]> = {
  blossom: [101, 102, 103, 777],
  broadleaf: [201, 202, 203],
  pine: [301, 302, 303],
  willow: [401, 402, 403],
};

const m4 = new Matrix4();
const q = new Quaternion();
const up = new Vector3(0, 1, 0);
const v3 = new Vector3();
const s3 = new Vector3();

/**
 * All hand-placed and scattered trees, grouped per kind/variant into InstancedMeshes
 * (one for bark, one for the canopy, one for willow strands).
 */
export class Trees {
  readonly group = new Group();
  /** world-space blossom blobs, used to spawn falling petals */
  readonly blossomBlobs: { x: number; y: number; z: number; r: number }[] = [];
  readonly models = new Map<string, TreeModel>();

  constructor(instances: TreeInstance[], density: number) {
    this.group.name = 'trees';
    const bark = createVegetationMaterial({
      name: 'bark',
      sway: 0.12,
      roughness: 0.95,
      doubleSided: false,
    });
    const canopyMats: Record<TreeKind, Material> = {
      blossom: createVegetationMaterial({
        name: 'blossom',
        map: createBlossomTexture(),
        alphaTest: 0.45,
        sway: 0.35,
        flutter: 0.035,
        keepNormals: true,
        translucency: 0.45,
      }),
      broadleaf: createVegetationMaterial({
        name: 'broadleaf',
        map: createLeafTexture(),
        alphaTest: 0.45,
        sway: 0.4,
        flutter: 0.045,
        keepNormals: true,
        translucency: 0.35,
      }),
      pine: createVegetationMaterial({
        name: 'pine',
        map: createPineTexture(),
        alphaTest: 0.4,
        sway: 0.2,
        flutter: 0.015,
        keepNormals: true,
        translucency: 0.15,
      }),
      willow: createVegetationMaterial({
        name: 'willow-dome',
        map: createLeafTexture(['#9dbd58', '#a9c763', '#8fb04d', '#b5cf70']),
        alphaTest: 0.45,
        sway: 0.4,
        flutter: 0.04,
        keepNormals: true,
        translucency: 0.4,
      }),
    };
    const strandMat = createVegetationMaterial({
      name: 'willow-strands',
      map: createWillowTexture(),
      alphaTest: 0.4,
      sway: 0.9,
      flutter: 0.06,
      keepNormals: true,
      translucency: 0.5,
    });

    // Bucket instances by kind + variant.
    const buckets = new Map<string, TreeInstance[]>();
    instances.forEach((inst, i) => {
      const seeds = SEEDS[inst.kind];
      const variant = inst.variant ?? i % Math.min(VARIANTS, seeds.length);
      const key = `${inst.kind}:${variant}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(inst);
    });

    for (const [key, list] of buckets) {
      const [kind, variantStr] = key.split(':') as [TreeKind, string];
      const seed = SEEDS[kind][Number(variantStr)]!;
      const model = growTree({ kind, seed, density });
      this.models.set(key, model);
      const matrices = list.map((inst) => {
        q.setFromAxisAngle(up, inst.rot);
        return new Matrix4().compose(
          v3.set(inst.x, inst.y - 0.05, inst.z),
          q,
          s3.setScalar(inst.scale),
        );
      });
      this.addInstanced(`${key}-bark`, model.trunk, bark, matrices);
      this.addInstanced(`${key}-canopy`, model.canopy, canopyMats[kind], matrices);
      if (model.strands) this.addInstanced(`${key}-strands`, model.strands, strandMat, matrices);
      if (kind === 'blossom') {
        list.forEach((inst, i) => {
          for (const b of model.blobs) {
            v3.copy(b.center).multiplyScalar(inst.scale).applyMatrix4(m4.makeRotationY(inst.rot));
            this.blossomBlobs.push({
              x: inst.x + v3.x,
              y: inst.y + v3.y,
              z: inst.z + v3.z,
              r: b.radius * inst.scale,
            });
          }
          void i;
        });
      }
    }
  }

  private addInstanced(
    name: string,
    geometry: BufferGeometry,
    material: Material,
    matrices: Matrix4[],
  ): void {
    for (const mesh of chunkedInstances(geometry, material, matrices, { name, chunk: Infinity })) {
      this.group.add(mesh);
    }
  }

  /** Crown radius of a placed tree's model, for shade painting and spacing. */
  crownOf(inst: TreeInstance, index: number): number {
    const seeds = SEEDS[inst.kind];
    const variant = inst.variant ?? index % Math.min(VARIANTS, seeds.length);
    return (this.models.get(`${inst.kind}:${variant}`)?.crownRadius ?? 2) * inst.scale;
  }

  addTo(scene: Scene): void {
    scene.add(this.group);
  }
}

/** Bakes a simple vertical gradient vertex colour into a (non-indexed) geometry. */
function tintGeometry(g: BufferGeometry, color: string): BufferGeometry {
  const col = new Color(color);
  const pos = g.attributes.position!;
  const arr = new Float32Array(pos.count * 3);
  for (let k = 0; k < pos.count; k++) {
    const shade = 0.7 + Math.min(0.4, pos.getY(k) * 0.06);
    arr[k * 3] = col.r * shade;
    arr[k * 3 + 1] = col.g * shade;
    arr[k * 3 + 2] = col.b * shade;
  }
  g.setAttribute('color', new BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

export interface FarTree {
  x: number;
  y: number;
  z: number;
  s: number;
  /** 0 = pine, 1 = broadleaf */
  kind: number;
}

/**
 * Hundreds of cheap trees on the rim hills outside the playable area: stacked cones for
 * pines, lumpy balls for broadleaves. Seen through haze they read as dense forest.
 */
export class FarForest {
  readonly group = new Group();

  constructor(points: FarTree[]) {
    const trunk = () => new ConeGeometry(0.25, 1.6, 5, 1).translate(0, 0.8, 0).toNonIndexed();
    const pineGeo = mergeGeometries([
      tintGeometry(new ConeGeometry(1.5, 5, 7, 1).translate(0, 3.3, 0).toNonIndexed(), '#35593a'),
      tintGeometry(new ConeGeometry(1.1, 3.4, 7, 1).translate(0, 5.4, 0).toNonIndexed(), '#3f6842'),
      tintGeometry(trunk(), '#5a4332'),
    ])!;
    const ballGeo = mergeGeometries([
      tintGeometry(new IcosahedronGeometry(2.2, 1).translate(0, 3.5, 0).toNonIndexed(), '#557f3c'),
      tintGeometry(
        new IcosahedronGeometry(1.5, 1).translate(1, 4.6, 0.4).toNonIndexed(),
        '#618a44',
      ),
      tintGeometry(trunk(), '#5a4332'),
    ])!;
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
    [pineGeo, ballGeo].forEach((geo, kind) => {
      const list = points.filter((p) => p.kind === kind);
      const mesh = new InstancedMesh(geo, mat, Math.max(1, list.length));
      mesh.count = list.length;
      list.forEach((p, i) => {
        q.setFromAxisAngle(up, p.x * 0.37 + p.z * 0.11);
        m4.compose(v3.set(p.x, p.y - 0.3, p.z), q, s3.setScalar(p.s));
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.name = kind === 0 ? 'far-pines' : 'far-broadleaves';
      this.group.add(mesh);
    });
  }

  addTo(scene: Scene): void {
    scene.add(this.group);
  }
}
