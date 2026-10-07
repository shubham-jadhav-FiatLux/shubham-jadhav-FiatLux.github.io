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
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { globalUniforms } from '../../render/uniforms';
import { BUMP_GLSL, NOISE3_GLSL, NOISE_GLSL, TERRAIN_GLSL } from '../../render/glsl';
import { WATER_LEVEL } from '../layout';
import { FINISH_ID, finishFor, type Finish } from './palette';

/** Material buckets: every structure in the valley is merged into one mesh per bucket. */
export type Bucket = 'paint' | 'roof' | 'glow' | 'lattice';

/** A lantern (or other warm light) in the world: for halos, light pools and lights. */
export interface LightSpot {
  x: number;
  y: number;
  z: number;
  /** size of the glowing body (m) */
  size: number;
  kind: 'paper' | 'stone' | 'altar';
}

const q = new Quaternion();
const tmpSize = new Vector3();
const tmpCentre = new Vector3();
/**
 * Edge (m) of the cells the big buckets are split into: each cell is its own mesh, so
 * the camera, and the sun's shadow camera round the panda, skip the far ones. The small
 * buckets (glow, lattice) stay whole: a few more triangles cost less than more draw calls.
 */
const CELL = 40;
const SPLIT: Record<Bucket, boolean> = { paint: true, roof: true, glow: false, lattice: false };
const grain = new Vector3();
const AXIS_X = new Vector3(1, 0, 0);
const AXIS_Y = new Vector3(0, 1, 0);
const AXIS_Z = new Vector3(0, 0, 1);

/** Deterministic 0..1 hash of an integer. */
function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

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

/**
 * The shared material of every painted, wooden, stone and gilded part. The finish (per
 * vertex) picks the surface: lacquer with a soft sheen and faint brush marks; wood with
 * fibres and growth lines along the part's long axis (`aGrain`); stone with grain,
 * speckles and moss on top; gold that catches the sky. Every part also darkens where it
 * meets the ground, and gets a wet algae band just above the lake.
 */
function createPaintMaterial(): MeshStandardMaterial {
  const paint = new MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 });
  paint.name = 'arch-paint';
  paint.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uWaterLevel: { value: WATER_LEVEL },
      uHeightMap: globalUniforms.uHeightMap,
      uMaskMap: globalUniforms.uMaskMap,
      uDetailMap: globalUniforms.uDetailMap,
      uTerrain: globalUniforms.uTerrain,
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
attribute vec2 aFinish;
attribute vec3 aGrain;
varying vec2 vFinish;
varying vec3 vGrain;
varying vec3 vArchWorld;
varying vec3 vArchNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
vFinish = aFinish;
vGrain = aGrain;
vArchWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vArchNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
uniform float uWaterLevel;
varying vec2 vFinish;
varying vec3 vGrain;
varying vec3 vArchWorld;
varying vec3 vArchNormal;
${NOISE_GLSL}
${NOISE3_GLSL}
${BUMP_GLSL}
${TERRAIN_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
float archH = 0.0;
float archRough = 0.6;
float archMetal = 0.0;
{
  int fid = int(vFinish.x + 0.5);
  float tone = vFinish.y;
  vec3 wp = vArchWorld;
  vec3 nW = normalize(vArchNormal);
  if (fid == 1) {
    // wood: fibres and growth lines along the grain, darker end grain
    vec3 g = normalize(vGrain);
    vec3 acrossV = cross(g, nW);
    float sideGrain = length(acrossV);
    acrossV = sideGrain > 0.3 ? acrossV / sideGrain : normalize(cross(g, vec3(0.267, 0.534, 0.802)));
    float a = dot(wp, g) + tone * 17.0;
    float c = dot(wp, acrossV) + tone * 3.1;
    float warp = vnoise(vec2(a * 0.7, c * 4.0));
    float fibre = vnoise(vec2(a * 1.6, c * 55.0 + warp * 3.0));
    float band = vnoise(vec2(a * 0.18, c * 7.0 + warp));
    float lines = smoothstep(0.62, 0.95, sin((c + warp * 0.12) * 70.0) * 0.5 + 0.5);
    diffuseColor.rgb *= (0.8 + 0.26 * band + 0.14 * fibre - 0.12 * lines) * (1.0 + tone * 0.1);
    diffuseColor.rgb *= sideGrain > 0.3 ? 1.0 : 0.78;
    archH = (fibre * 0.5 + band * 0.3 - lines * 0.5) * 0.003;
    archRough = 0.74 - 0.1 * band;
  } else if (fid == 2) {
    // stone: grain, mineral speckles, moss and dark weathering on top
    float s1 = vnoise3(wp * 1.6 + tone * 4.0);
    float s2 = vnoise3(wp * 6.0);
    float sp = smoothstep(0.8, 0.88, vnoise3(wp * 22.0));
    diffuseColor.rgb *= 0.84 + 0.2 * s1 + 0.08 * s2 + tone * 0.05;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.22 + 0.02, sp * 0.4);
    float moss = smoothstep(0.55, 0.95, nW.y) * smoothstep(0.6, 0.8, vnoise3(wp * 0.8 + 3.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.19, 0.06), moss * 0.35);
    archH = (s1 * 0.4 + s2 * 0.5 - sp * 0.2) * 0.006;
    archRough = 0.9;
  } else if (fid == 3) {
    // gilding, a little worn
    float wear = vnoise3(wp * 3.0);
    diffuseColor.rgb *= 0.9 + 0.2 * wear;
    archRough = 0.3 + 0.15 * wear;
    archMetal = 0.65;
  } else {
    // lacquer: gentle fading and fine brush marks
    float fade = vnoise3(wp * 0.9 + tone * 2.0);
    float brush = vnoise3(wp * vec3(14.0, 3.0, 14.0));
    diffuseColor.rgb *= 0.92 + 0.12 * fade + 0.04 * brush;
    archRough = 0.44 + 0.12 * fade;
    archH = brush * 0.0006;
  }
  // grime where a part meets the ground, a wet algae band just above the lake
  float ground = terrainHeightAt(wp.xz);
  float grime = 1.0 - smoothstep(0.0, 0.5, wp.y - ground);
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.62, 0.57, 0.5), grime * 0.8);
  float wl = wp.y - uWaterLevel;
  float wet = step(ground, uWaterLevel - 0.02) * step(-0.5, wl)
    * (1.0 - smoothstep(0.02, 0.32 + 0.14 * vnoise(wp.xz * 3.0 + wp.y), wl));
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.4, 0.48, 0.38), wet);
  archRough = mix(archRough, 0.32, wet);
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = archRough;',
      )
      .replace(
        '#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\nmetalnessFactor = archMetal;',
      )
      .replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\nnormal = bumpFromHeight(-vViewPosition, normal, archH);',
      );
  };
  paint.customProgramCacheKey = () => 'arch-paint-v2';
  return paint;
}

function createMaterials(): Record<Bucket, Material> {
  const paint = createPaintMaterial();

  const roof = new MeshStandardMaterial({ vertexColors: true, roughness: 0.46, metalness: 0.05 });
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
          // Rows of round barrel tiles with dark gaps and overlapping courses; every tile
          // fired a little differently, with faint weathering streaks down the slope.
          float colU = fract(vRoofUv.x * 3.3);
          float barrel = sin(colU * 3.14159);
          float gap = smoothstep(0.0, 0.14, colU) * smoothstep(1.0, 0.86, colU);
          float row = fract(vRoofUv.y * 3.1);
          float course = mix(0.78, 1.0, smoothstep(0.0, 0.3, row));
          vec2 tile = floor(vec2(vRoofUv.x * 3.3, vRoofUv.y * 3.1));
          float fired = fract(sin(dot(tile, vec2(12.9898, 78.233))) * 43758.5453);
          float streak = fract(sin(tile.x * 91.7) * 4375.85);
          diffuseColor.rgb *= mix(0.5, 1.0, gap) * (0.78 + 0.3 * barrel) * course;
          diffuseColor.rgb *= (0.9 + 0.18 * fired) * (1.0 - 0.12 * smoothstep(0.7, 1.0, streak));
        }`,
      );
  };
  roof.customProgramCacheKey = () => 'arch-roof-v2';

  const glow = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 });
  glow.name = 'arch-glow';
  glow.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = globalUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlowWorld;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvGlowWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uTime;\nvarying vec3 vGlowWorld;\n${NOISE_GLSL}`,
      )
      // lit from within: the sun barely touches the paper
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 0.3;')
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
{
  // paper lit by a candle inside: brightest where it faces you, deeper at the rim,
  // keeping its own colour (red lanterns stay red) with a gentle flicker
  float facing = abs(dot(normalize(vNormal), normalize(vViewPosition)));
  float flicker = 0.84 + 0.16 * vnoise(vec2(dot(vGlowWorld, vec3(1.7, 0.3, 2.9)), uTime * 5.5));
  vec3 inner = vColor.rgb * (1.2 + 1.8 * pow(facing, 1.3)) + vec3(0.55, 0.22, 0.05) * pow(facing, 2.0);
  totalEmissiveRadiance += inner * 1.5 * flicker;
}`,
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
  /** every warm light registered while building */
  readonly lights: LightSpot[] = [];
  private serial = 0;

  light(spot: LightSpot): void {
    this.lights.push(spot);
  }

  /** Sky reflections on lacquer, glazed tiles and gilding. */
  setEnvironment(env: Texture): void {
    const intensity: Partial<Record<Bucket, number>> = { paint: 0.45, roof: 0.35, lattice: 0.25 };
    for (const [bucket, k] of Object.entries(intensity) as [Bucket, number][]) {
      const m = this.materials[bucket] as MeshStandardMaterial;
      m.envMap = env;
      m.envMapIntensity = k;
      m.needsUpdate = true;
    }
  }

  /**
   * Adds a part in world space. In the 'paint' bucket the part's finish (lacquer, wood,
   * stone, gilding) is taken from `finish` or implied by the palette colour, each part gets
   * its own slight tone, and wood grain follows the part's longest axis.
   */
  add(
    bucket: Bucket,
    geometry: BufferGeometry,
    color: ColorRepresentation | null,
    matrix: Matrix4,
    finish?: Finish,
  ): void {
    // Parts keep their shared vertices (indexed geometry): far fewer vertices to shade
    // than one copy per triangle corner. A part without normals of its own is shaded
    // flat, one normal per face, so it is split into separate triangles first.
    let g =
      geometry.index && !geometry.attributes.normal ? geometry.toNonIndexed() : geometry.clone();
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
    if (bucket === 'paint') {
      const id = FINISH_ID[finish ?? finishFor(color)];
      const tone = hash01(this.serial++) * 2 - 1;
      g.computeBoundingBox();
      const size = g.boundingBox!.getSize(tmpSize);
      const axis =
        size.x >= size.y && size.x >= size.z ? AXIS_X : size.y >= size.z ? AXIS_Y : AXIS_Z;
      grain.copy(axis).transformDirection(matrix);
      const n = g.attributes.position!.count;
      const fin = new Float32Array(n * 2);
      const gr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        fin[i * 2] = id;
        fin[i * 2 + 1] = tone;
        gr[i * 3] = grain.x;
        gr[i * 3 + 1] = grain.y;
        gr[i * 3 + 2] = grain.z;
      }
      g.setAttribute('aFinish', new BufferAttribute(fin, 2));
      g.setAttribute('aGrain', new BufferAttribute(gr, 3));
    }
    g = g.applyMatrix4(matrix);
    if (!g.index) {
      const n = g.attributes.position!.count;
      const index = new (n > 65535 ? Uint32Array : Uint16Array)(n);
      for (let i = 0; i < n; i++) index[i] = i;
      g.setIndex(new BufferAttribute(index, 1));
    }
    this.parts[bucket].push(g);
  }

  /** Merges the parts: one mesh per material bucket and cell of the valley. */
  build(): Mesh[] {
    const meshes: Mesh[] = [];
    for (const bucket of Object.keys(this.parts) as Bucket[]) {
      const cells = new Map<string, BufferGeometry[]>();
      for (const g of this.parts[bucket]) {
        g.computeBoundingBox();
        g.boundingBox!.getCenter(tmpCentre);
        const key = SPLIT[bucket]
          ? `${Math.floor(tmpCentre.x / CELL)},${Math.floor(tmpCentre.z / CELL)}`
          : 'all';
        let list = cells.get(key);
        if (!list) cells.set(key, (list = []));
        list.push(g);
      }
      for (const [key, list] of cells) {
        const merged = mergeGeometries(list, false);
        list.forEach((g) => g.dispose());
        if (!merged) {
          console.warn(`architecture: could not merge ${bucket} @${key}`);
          continue;
        }
        // centred on its own middle, so the renderer can sort it by distance
        merged.computeBoundingSphere();
        const centre = merged.boundingSphere!.center.clone();
        merged.translate(-centre.x, -centre.y, -centre.z);
        const mesh = new Mesh(merged, this.materials[bucket]);
        mesh.name = `architecture-${bucket}@${key}`;
        mesh.position.copy(centre);
        mesh.castShadow = bucket !== 'glow';
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        meshes.push(mesh);
      }
    }
    return meshes;
  }
}
