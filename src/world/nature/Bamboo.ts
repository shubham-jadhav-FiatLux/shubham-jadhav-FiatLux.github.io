import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  Matrix4,
  Quaternion,
  Vector3,
  type Scene,
} from 'three';
import { Random } from '../../utils/random';
import { createVegetationMaterial } from './vegetationMaterial';
import { createBambooLeafTexture } from './textures';
import { chunkedInstances } from './instancing';

export interface BambooStalk {
  x: number;
  y: number;
  z: number;
  /** height multiplier */
  scale: number;
  rot: number;
  lean: number;
}

const m4 = new Matrix4();
const q = new Quaternion();
const qLean = new Quaternion();
const v3 = new Vector3();
const s3 = new Vector3();
const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);

/** Builds one bamboo culm (stalk with node rings) plus leaf sprays near the top. */
function createStalk(
  seed: number,
  height: number,
): { stalk: BufferGeometry; foliage: BufferGeometry } {
  const rand = new Random(seed);
  const nodes = Math.round(height / 0.42);
  const radial = 5;
  const rBottom = 0.085;
  const rTop = 0.05;
  const cyl = new CylinderGeometry(rTop, rBottom, height, radial, nodes * 2, true);
  cyl.translate(0, height / 2, 0);
  cyl.deleteAttribute('uv');
  const pos = cyl.attributes.position as BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const wind = new Float32Array(pos.count * 2);
  const base = new Color('#5f843a');
  const top = new Color('#a5bd57');
  const nodeCol = new Color('#4a6a2c');
  const tint = new Color('#c9c26a');
  const c = new Color();
  const golden = rand.chance(0.18);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = y / height;
    const seg = y / (height / nodes);
    const atNode = Math.abs(seg - Math.round(seg)) < 0.02 && seg > 0.5;
    if (atNode) {
      const k = 1.14;
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
    c.copy(base).lerp(top, t);
    if (golden) c.lerp(tint, 0.45);
    if (atNode) c.copy(nodeCol);
    colors.set([c.r, c.g, c.b], i * 3);
    wind[i * 2] = t;
    wind[i * 2 + 1] = 0;
  }
  cyl.setAttribute('color', new BufferAttribute(colors, 3));
  cyl.setAttribute('aWind', new BufferAttribute(wind, 2));
  cyl.computeVertexNormals();

  // Foliage: alpha-tested cards of leaf sprays hanging from the upper nodes.
  const lp: number[] = [];
  const ln: number[] = [];
  const lu: number[] = [];
  const lc: number[] = [];
  const lw: number[] = [];
  const li: number[] = [];
  let vi = 0;
  const leafTint = new Color('#ffffff');
  const firstNode = Math.floor(nodes * 0.3);
  for (let n = firstNode; n <= nodes; n++) {
    const y = (n / nodes) * height;
    const heightF = (n - firstNode) / Math.max(1, nodes - firstNode);
    const cards = n === nodes ? 4 : rand.int(2, 3);
    for (let k = 0; k < cards; k++) {
      const az = rand.range(0, Math.PI * 2);
      const twig = rand.range(0.15, 0.55) * (1 - heightF * 0.4);
      const ax = Math.cos(az) * twig;
      const az2 = Math.sin(az) * twig;
      const w = rand.range(1.1, 1.5) * (1 - heightF * 0.2);
      const hgt = rand.range(1.3, 1.8) * (1 - heightF * 0.2);
      const out = new Vector3(Math.cos(az), 0, Math.sin(az));
      const side = new Vector3(-out.z, 0, out.x).applyAxisAngle(Y, rand.spread(0.5));
      const tilt = rand.range(0.25, 0.6);
      const down = new Vector3(0, -1, 0).addScaledVector(out, tilt).normalize();
      const top = new Vector3(ax, y + 0.18, az2);
      const corners = [
        top.clone().addScaledVector(side, -w / 2),
        top.clone().addScaledVector(side, w / 2),
        top
          .clone()
          .addScaledVector(side, w / 2)
          .addScaledVector(down, hgt),
        top
          .clone()
          .addScaledVector(side, -w / 2)
          .addScaledVector(down, hgt),
      ];
      const uvs = [
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 0],
      ];
      const normal = out.clone().lerp(Y, 0.45).normalize();
      const shade = 0.75 + 0.35 * heightF + rand.spread(0.08);
      corners.forEach((p, ci) => {
        lp.push(p.x, p.y, p.z);
        ln.push(normal.x, normal.y, normal.z);
        lu.push(uvs[ci]![0]!, uvs[ci]![1]!);
        lc.push(leafTint.r * shade, leafTint.g * shade, leafTint.b * shade);
        lw.push(p.y / height, ci < 2 ? 0.3 : 1);
      });
      li.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      vi += 4;
    }
  }
  const foliage = new BufferGeometry();
  foliage.setAttribute('position', new BufferAttribute(new Float32Array(lp), 3));
  foliage.setAttribute('normal', new BufferAttribute(new Float32Array(ln), 3));
  foliage.setAttribute('uv', new BufferAttribute(new Float32Array(lu), 2));
  foliage.setAttribute('color', new BufferAttribute(new Float32Array(lc), 3));
  foliage.setAttribute('aWind', new BufferAttribute(new Float32Array(lw), 2));
  foliage.setIndex(li);
  return { stalk: cyl, foliage };
}

/**
 * Bamboo groves: a few stalk variants drawn as InstancedMeshes. Stalks sway in the wind
 * and lean away when the panda squeezes between them.
 */
export class Bamboo {
  readonly group = new Group();
  readonly count: number;

  constructor(stalks: BambooStalk[]) {
    this.count = stalks.length;
    const stalkMaterial = createVegetationMaterial({
      name: 'bamboo-stalk',
      sway: 0.55,
      push: 0.55,
      pushRadius: 1.4,
      translucency: 0.2,
      roughness: 0.55,
      doubleSided: false,
    });
    const leafMaterial = createVegetationMaterial({
      name: 'bamboo-leaves',
      map: createBambooLeafTexture(),
      alphaTest: 0.4,
      sway: 0.55,
      flutter: 0.05,
      push: 0.55,
      pushRadius: 1.4,
      translucency: 0.45,
      keepNormals: true,
    });
    const variants = [createStalk(11, 7.5), createStalk(12, 9), createStalk(13, 10.5)];
    const buckets: BambooStalk[][] = variants.map(() => []);
    stalks.forEach((s, i) => buckets[i % variants.length]!.push(s));
    variants.forEach((geo, vi) => {
      const list = buckets[vi]!;
      if (!list.length) return;
      for (const [part, g, mat] of [
        ['stalk', geo.stalk, stalkMaterial],
        ['leaves', geo.foliage, leafMaterial],
      ] as const) {
        const matrices = list.map((s) => {
          q.setFromAxisAngle(Y, s.rot);
          qLean.setFromAxisAngle(X, s.lean);
          q.multiply(qLean);
          return m4
            .clone()
            .compose(v3.set(s.x, s.y - 0.1, s.z), q, s3.set(s.scale, s.scale, s.scale));
        });
        // Thin culms barely show in shadows; only the leaves cast them.
        for (const mesh of chunkedInstances(g, mat, matrices, {
          name: `bamboo-${part}-${vi}`,
          chunk: Infinity,
          castShadow: part === 'leaves',
        })) {
          this.group.add(mesh);
        }
      }
    });
  }

  addTo(scene: Scene): void {
    scene.add(this.group);
  }
}
