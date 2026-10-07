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

const sj_VARIANTS = 3;
const sj_SEEDS: Record<TreeKind, number[]> = {
  blossom: [101, 102, 103, 777],
  broadleaf: [201, 202, 203],
  pine: [301, 302, 303],
  willow: [401, 402, 403],
};

const sj_m4 = new Matrix4();
const sj_q = new Quaternion();
const sj_up = new Vector3(0, 1, 0);
const sj_v3 = new Vector3();
const sj_s3 = new Vector3();

/**
 * All hand-placed and scattered trees, grouped per kind/variant into InstancedMeshes
 * (one for bark, one for the canopy, one for willow strands).
 */
export class Trees {
  readonly group = new Group();
  /** world-space blossom blobs, used to spawn falling petals */
  readonly blossomBlobs: { x: number; y: number; z: number; r: number }[] = [];
  readonly models = new Map<string, TreeModel>();

  constructor(sj_instances: TreeInstance[], sj_density: number) {
    this.group.name = 'trees';
    const sj_bark = createVegetationMaterial({
      name: 'bark',
      sway: 0.12,
      roughness: 0.95,
      doubleSided: false,
    });
    const sj_canopyMats: Record<TreeKind, Material> = {
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
    const sj_strandMat = createVegetationMaterial({
      name: 'willow-strands',
      map: createWillowTexture(),
      alphaTest: 0.4,
      sway: 0.9,
      flutter: 0.06,
      keepNormals: true,
      translucency: 0.5,
    });

    // Bucket instances by kind + variant.
    const sj_buckets = new Map<string, TreeInstance[]>();
    sj_instances.forEach((sj_inst, sj_i) => {
      const sj_seeds = sj_SEEDS[sj_inst.kind];
      const sj_variant = sj_inst.variant ?? sj_i % Math.min(sj_VARIANTS, sj_seeds.length);
      const sj_key = `${sj_inst.kind}:${sj_variant}`;
      if (!sj_buckets.has(sj_key)) sj_buckets.set(sj_key, []);
      sj_buckets.get(sj_key)!.push(sj_inst);
    });

    for (const [sj_key, sj_list] of sj_buckets) {
      const [sj_kind, sj_variantStr] = sj_key.split(':') as [TreeKind, string];
      const sj_seed = sj_SEEDS[sj_kind][Number(sj_variantStr)]!;
      const sj_model = growTree({ kind: sj_kind, seed: sj_seed, density: sj_density });
      this.models.set(sj_key, sj_model);
      const sj_matrices = sj_list.map((sj_inst) => {
        sj_q.setFromAxisAngle(sj_up, sj_inst.rot);
        return new Matrix4().compose(
          sj_v3.set(sj_inst.x, sj_inst.y - 0.05, sj_inst.z),
          sj_q,
          sj_s3.setScalar(sj_inst.scale),
        );
      });
      this.addInstanced(`${sj_key}-bark`, sj_model.trunk, sj_bark, sj_matrices);
      this.addInstanced(`${sj_key}-canopy`, sj_model.canopy, sj_canopyMats[sj_kind], sj_matrices);
      if (sj_model.strands)
        this.addInstanced(`${sj_key}-strands`, sj_model.strands, sj_strandMat, sj_matrices);
      if (sj_kind === 'blossom') {
        sj_list.forEach((sj_inst, sj_i) => {
          for (const sj_b of sj_model.blobs) {
            sj_v3
              .copy(sj_b.center)
              .multiplyScalar(sj_inst.scale)
              .applyMatrix4(sj_m4.makeRotationY(sj_inst.rot));
            this.blossomBlobs.push({
              x: sj_inst.x + sj_v3.x,
              y: sj_inst.y + sj_v3.y,
              z: sj_inst.z + sj_v3.z,
              r: sj_b.radius * sj_inst.scale,
            });
          }
          void sj_i;
        });
      }
    }
  }

  private addInstanced(
    sj_name: string,
    sj_geometry: BufferGeometry,
    sj_material: Material,
    sj_matrices: Matrix4[],
  ): void {
    for (const sj_mesh of chunkedInstances(sj_geometry, sj_material, sj_matrices, {
      name: sj_name,
      chunk: Infinity,
    })) {
      this.group.add(sj_mesh);
    }
  }

  /** Crown radius of a placed tree's model, for shade painting and spacing. */
  crownOf(sj_inst: TreeInstance, sj_index: number): number {
    const sj_seeds = sj_SEEDS[sj_inst.kind];
    const sj_variant = sj_inst.variant ?? sj_index % Math.min(sj_VARIANTS, sj_seeds.length);
    return (this.models.get(`${sj_inst.kind}:${sj_variant}`)?.crownRadius ?? 2) * sj_inst.scale;
  }

  addTo(sj_scene: Scene): void {
    sj_scene.add(this.group);
  }
}

/** Bakes a simple vertical gradient vertex colour into a (non-indexed) geometry. */
function tintGeometry(sj_g: BufferGeometry, sj_color: string): BufferGeometry {
  const sj_col = new Color(sj_color);
  const sj_pos = sj_g.attributes.position!;
  const sj_arr = new Float32Array(sj_pos.count * 3);
  for (let sj_k = 0; sj_k < sj_pos.count; sj_k++) {
    const sj_shade = 0.7 + Math.min(0.4, sj_pos.getY(sj_k) * 0.06);
    sj_arr[sj_k * 3] = sj_col.r * sj_shade;
    sj_arr[sj_k * 3 + 1] = sj_col.g * sj_shade;
    sj_arr[sj_k * 3 + 2] = sj_col.b * sj_shade;
  }
  sj_g.setAttribute('color', new BufferAttribute(sj_arr, 3));
  sj_g.deleteAttribute('uv');
  sj_g.computeVertexNormals();
  return sj_g;
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

  constructor(sj_points: FarTree[]) {
    const sj_trunk = () => new ConeGeometry(0.25, 1.6, 5, 1).translate(0, 0.8, 0).toNonIndexed();
    const sj_pineGeo = mergeGeometries([
      tintGeometry(new ConeGeometry(1.5, 5, 7, 1).translate(0, 3.3, 0).toNonIndexed(), '#35593a'),
      tintGeometry(new ConeGeometry(1.1, 3.4, 7, 1).translate(0, 5.4, 0).toNonIndexed(), '#3f6842'),
      tintGeometry(sj_trunk(), '#5a4332'),
    ])!;
    const sj_ballGeo = mergeGeometries([
      tintGeometry(new IcosahedronGeometry(2.2, 1).translate(0, 3.5, 0), '#557f3c'),
      tintGeometry(new IcosahedronGeometry(1.5, 1).translate(1, 4.6, 0.4), '#618a44'),
      tintGeometry(sj_trunk(), '#5a4332'),
    ])!;
    const sj_mat = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      flatShading: true,
    });
    [sj_pineGeo, sj_ballGeo].forEach((sj_geo, sj_kind) => {
      const sj_list = sj_points.filter((sj_p) => sj_p.kind === sj_kind);
      const sj_mesh = new InstancedMesh(sj_geo, sj_mat, Math.max(1, sj_list.length));
      sj_mesh.count = sj_list.length;
      sj_list.forEach((sj_p, sj_i) => {
        sj_q.setFromAxisAngle(sj_up, sj_p.x * 0.37 + sj_p.z * 0.11);
        sj_m4.compose(sj_v3.set(sj_p.x, sj_p.y - 0.3, sj_p.z), sj_q, sj_s3.setScalar(sj_p.s));
        sj_mesh.setMatrixAt(sj_i, sj_m4);
      });
      sj_mesh.instanceMatrix.needsUpdate = true;
      sj_mesh.computeBoundingSphere();
      sj_mesh.name = sj_kind === 0 ? 'far-pines' : 'far-broadleaves';
      this.group.add(sj_mesh);
    });
  }

  addTo(sj_scene: Scene): void {
    sj_scene.add(this.group);
  }
}
