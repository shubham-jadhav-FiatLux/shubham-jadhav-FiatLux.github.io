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
  geometry: BufferGeometry,
  material: Material,
  matrices: Matrix4[],
  o: ChunkOptions,
): InstancedMesh[] {
  const size = o.chunk ?? 32;
  const buckets = new Map<string, Matrix4[]>();
  for (const m of matrices) {
    const key = `${Math.floor(m.elements[12]! / size)},${Math.floor(m.elements[14]! / size)}`;
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(m);
  }
  const meshes: InstancedMesh[] = [];
  for (const [key, list] of buckets) {
    const mesh = new InstancedMesh(geometry, material, list.length);
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = o.castShadow ?? true;
    mesh.receiveShadow = o.receiveShadow ?? true;
    mesh.name = `${o.name}@${key}`;
    meshes.push(mesh);
  }
  return meshes;
}
