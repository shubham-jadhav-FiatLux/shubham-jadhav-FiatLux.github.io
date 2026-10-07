import { InstancedMesh, type BufferGeometry, type Material, type Matrix4 } from 'three';

export interface ChunkOptions {
  name: string;
  /** chunk edge length in metres */
  chunk?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/**
 * Splits instances into spatial chunks, one InstancedMesh each, so the camera and the
 * shadow camera can frustum-cull groups of trees instead of drawing the whole valley.
 */
export function chunkedInstances(
  sj_geometry: BufferGeometry,
  sj_material: Material,
  sj_matrices: Matrix4[],
  sj_o: ChunkOptions,
): InstancedMesh[] {
  const sj_size = sj_o.chunk ?? 32;
  const sj_buckets = new Map<string, Matrix4[]>();
  for (const sj_m of sj_matrices) {
    const sj_key = `${Math.floor(sj_m.elements[12]! / sj_size)},${Math.floor(sj_m.elements[14]! / sj_size)}`;
    let sj_list = sj_buckets.get(sj_key);
    if (!sj_list) sj_buckets.set(sj_key, (sj_list = []));
    sj_list.push(sj_m);
  }
  const sj_meshes: InstancedMesh[] = [];
  for (const [sj_key, sj_list] of sj_buckets) {
    const sj_mesh = new InstancedMesh(sj_geometry, sj_material, sj_list.length);
    sj_list.forEach((sj_m, sj_i) => sj_mesh.setMatrixAt(sj_i, sj_m));
    sj_mesh.instanceMatrix.needsUpdate = true;
    sj_mesh.computeBoundingSphere();
    sj_mesh.castShadow = sj_o.castShadow ?? true;
    sj_mesh.receiveShadow = sj_o.receiveShadow ?? true;
    sj_mesh.name = `${sj_o.name}@${sj_key}`;
    sj_meshes.push(sj_mesh);
  }
  return sj_meshes;
}
