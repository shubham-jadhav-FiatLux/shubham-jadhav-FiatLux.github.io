import {
  BufferAttribute,
  CanvasTexture,
  Color,
  Euler,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type ColorRepresentation,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Material buckets: every structure in the valley is merged into one mesh per bucket. */
export type Bucket = 'paint' | 'roof' | 'glow' | 'lattice';

const q = new Quaternion();

/** Local transform helper: position, Euler rotation (rad) and scale. */
export function T(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): Matrix4 {
  q.setFromEuler(new Euler(rx, ry, rz));
  return new Matrix4().compose(new Vector3(x, y, z), q, new Vector3(sx, sy, sz));
}

/** parent × child */
export function mul(parent: Matrix4, child: Matrix4): Matrix4 {
  return new Matrix4().multiplyMatrices(parent, child);
}

function createLatticeTexture(): CanvasTexture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e9dcc0'; // paper behind the lattice
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = '#4e2f1f';
  ctx.lineWidth = 7;
  ctx.strokeRect(0, 0, s, s);
  ctx.lineWidth = 4;
  // "cracked ice" + grid lattice
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo((i * s) / 4, 0);
    ctx.lineTo((i * s) / 4, s);
    ctx.moveTo(0, (i * s) / 4);
    ctx.lineTo(s, (i * s) / 4);
    ctx.stroke();
  }
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(s * 0.25, s * 0.5);
  ctx.lineTo(s * 0.5, s * 0.25);
  ctx.lineTo(s * 0.75, s * 0.5);
  ctx.lineTo(s * 0.5, s * 0.75);
  ctx.closePath();
  ctx.stroke();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

function createMaterials(): Record<Bucket, Material> {
  const paint = new MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 });
  paint.name = 'arch-paint';

  const roof = new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.05 });
  roof.name = 'arch-roof';
  roof.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 aRoofUv;\nvarying vec2 vRoofUv;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoofUv = aRoofUv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRoofUv;')
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        {
          // Rows of round barrel tiles with dark gaps and overlapping courses.
          float colU = fract(vRoofUv.x * 3.3);
          float barrel = sin(colU * 3.14159);
          float gap = smoothstep(0.0, 0.14, colU) * smoothstep(1.0, 0.86, colU);
          float row = fract(vRoofUv.y * 3.1);
          float course = mix(0.78, 1.0, smoothstep(0.0, 0.3, row));
          diffuseColor.rgb *= mix(0.5, 1.0, gap) * (0.78 + 0.3 * barrel) * course;
        }`,
      );
  };
  roof.customProgramCacheKey = () => 'arch-roof';

  const glow = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
  glow.name = 'arch-glow';
  glow.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * 2.4;',
    );
  };
  glow.customProgramCacheKey = () => 'arch-glow';

  const lattice = new MeshStandardMaterial({
    map: createLatticeTexture(),
    vertexColors: true,
    roughness: 0.85,
  });
  lattice.name = 'arch-lattice';
  return { paint, roof, glow, lattice };
}

/**
 * Collects primitive parts from every structure (already placed in world space) and
 * merges them into one mesh per material bucket: the whole village is a handful of draw
 * calls.
 */
export class ArchBuilder {
  readonly materials = createMaterials();
  private parts: Record<Bucket, BufferGeometry[]> = { paint: [], roof: [], glow: [], lattice: [] };

  add(
    bucket: Bucket,
    geometry: BufferGeometry,
    color: ColorRepresentation | null,
    matrix: Matrix4,
  ): void {
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (bucket === 'roof') {
      const uv = g.getAttribute('uv');
      if (uv) g.setAttribute('aRoofUv', uv.clone());
      else
        g.setAttribute(
          'aRoofUv',
          new BufferAttribute(new Float32Array(g.attributes.position!.count * 2), 2),
        );
    }
    for (const name of Object.keys(g.attributes)) {
      const keep =
        name === 'position' ||
        name === 'normal' ||
        name === 'color' ||
        (bucket === 'roof' && name === 'aRoofUv') ||
        (bucket === 'lattice' && name === 'uv');
      if (!keep) g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (color !== null || !g.attributes.color) {
      const c = new Color(color ?? '#ffffff');
      const arr = new Float32Array(g.attributes.position!.count * 3);
      for (let i = 0; i < arr.length; i += 3) arr.set([c.r, c.g, c.b], i);
      g.setAttribute('color', new BufferAttribute(arr, 3));
    }
    g = g.applyMatrix4(matrix);
    this.parts[bucket].push(g);
  }

  build(): Mesh[] {
    const meshes: Mesh[] = [];
    for (const bucket of Object.keys(this.parts) as Bucket[]) {
      const list = this.parts[bucket];
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) {
        console.warn(`architecture: could not merge bucket ${bucket}`);
        continue;
      }
      merged.computeBoundingSphere();
      const mesh = new Mesh(merged, this.materials[bucket]);
      mesh.name = `architecture-${bucket}`;
      mesh.castShadow = bucket !== 'glow';
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      meshes.push(mesh);
    }
    return meshes;
  }
}
