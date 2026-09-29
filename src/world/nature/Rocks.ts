import {
  BufferAttribute,
  Color,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Scene,
} from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimplexNoise } from '../../utils/noise';

export type RockStyle = 'boulder' | 'flat' | 'tall';

export interface RockInstance {
  x: number;
  y: number;
  z: number;
  /** uniform size in metres (roughly the radius) */
  size: number;
  rot: number;
  style: RockStyle;
  /** sink into the ground (fraction of size) */
  sink?: number;
  tilt?: number;
}

const m4 = new Matrix4();
const q = new Quaternion();
const q2 = new Quaternion();
const v3 = new Vector3();
const s3 = new Vector3();
const Y = new Vector3(0, 1, 0);
const X = new Vector3(1, 0, 0);

/**
 * Smooth, weathered rocks with moss on their upward faces (baked into vertex colours).
 * "tall" rocks are eroded scholar-rock pillars for the gardens.
 */
function createRock(seed: number, style: RockStyle): BufferGeometry {
  const noise = new SimplexNoise(seed);
  let geo: BufferGeometry = new IcosahedronGeometry(1, 4);
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo);
  const pos = geo.attributes.position as BufferAttribute;
  const stretch =
    style === 'flat'
      ? new Vector3(1.3, 0.55, 1.1)
      : style === 'tall'
        ? new Vector3(0.55, 1.7, 0.5)
        : new Vector3(1.1, 0.8, 1);
  const disp = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    v3.fromBufferAttribute(pos, i);
    const n1 = noise.fbm3(v3.x * 1.1, v3.y * 1.1, v3.z * 1.1, 4);
    const ridged = 1 - Math.abs(noise.noise3(v3.x * 2.3 + 5, v3.y * 2.3, v3.z * 2.3));
    let d = 1 + n1 * 0.28 + ridged * 0.08;
    if (style === 'tall')
      d +=
        Math.sin(v3.y * 6 + n1 * 4) * 0.08 -
        Math.max(0, noise.noise3(v3.x * 3, v3.y * 3, v3.z * 3)) * 0.25;
    disp[i] = d;
    v3.multiplyScalar(d).multiply(stretch);
    // flatten the bottom so rocks sit on the ground
    if (v3.y < -0.35 * stretch.y) v3.y = -0.35 * stretch.y + (v3.y + 0.35 * stretch.y) * 0.25;
    pos.setXYZ(i, v3.x, v3.y, v3.z);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal as BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const stone = new Color(style === 'tall' ? '#85847c' : '#8f8a7f');
  const dark = new Color('#5e5a52');
  const moss = new Color('#6c7f3f');
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const ny = nrm.getY(i);
    const crevice = Math.min(1, Math.max(0, (1.05 - disp[i]!) * 3));
    const speck = noise.noise3(pos.getX(i) * 6, pos.getY(i) * 6, pos.getZ(i) * 6);
    c.copy(stone)
      .multiplyScalar(0.92 + speck * 0.12)
      .lerp(dark, crevice * 0.6);
    const mossAmt =
      Math.max(0, (ny - 0.45) * 1.8) *
      (0.6 + 0.4 * noise.noise3(pos.getX(i) * 2, 0, pos.getZ(i) * 2));
    c.lerp(moss, Math.min(0.85, Math.max(0, mossAmt)));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  return geo;
}

/** All rocks, bucketed into a few variants per style. */
export class Rocks {
  readonly group = new Group();

  constructor(rocks: RockInstance[]) {
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0,
    });
    const styles: RockStyle[] = ['boulder', 'flat', 'tall'];
    for (const style of styles) {
      const list = rocks.filter((r) => r.style === style);
      if (!list.length) continue;
      const variants = [0, 1, 2].map((k) =>
        createRock(1000 + k * 17 + styles.indexOf(style) * 101, style),
      );
      const buckets: RockInstance[][] = variants.map(() => []);
      list.forEach((r, i) => buckets[i % variants.length]!.push(r));
      variants.forEach((geo, vi) => {
        const bucket = buckets[vi]!;
        if (!bucket.length) return;
        const mesh = new InstancedMesh(geo, material, bucket.length);
        bucket.forEach((r, i) => {
          q.setFromAxisAngle(Y, r.rot);
          q2.setFromAxisAngle(X, r.tilt ?? 0);
          q.multiply(q2);
          m4.compose(v3.set(r.x, r.y - r.size * (r.sink ?? 0.2), r.z), q, s3.setScalar(r.size));
          mesh.setMatrixAt(i, m4);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = `rocks-${style}-${vi}`;
        this.group.add(mesh);
      });
    }
  }

  addTo(scene: Scene): void {
    scene.add(this.group);
  }
}
