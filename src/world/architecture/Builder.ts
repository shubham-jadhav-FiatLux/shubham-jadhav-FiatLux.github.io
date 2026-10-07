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
import { sj_globalUniforms } from '../../render/uniforms';
import { sj_BUMP_GLSL, sj_NOISE3_GLSL, sj_NOISE_GLSL, sj_TERRAIN_GLSL } from '../../render/glsl';
import { sj_WATER_LEVEL } from '../layout';
import { sj_FINISH_ID, finishFor, type Finish } from './palette';

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

const sj_q = new Quaternion();
const sj_tmpSize = new Vector3();
const sj_tmpCentre = new Vector3();
/**
 * Edge (m) of the cells the big buckets are split into: each cell is its own mesh, so
 * the camera, and the sun's shadow camera round the panda, skip the far ones. The small
 * buckets (glow, lattice) stay whole: a few more triangles cost less than more draw calls.
 */
const sj_CELL = 40;
const sj_SPLIT: Record<Bucket, boolean> = { paint: true, roof: true, glow: false, lattice: false };
const sj_grain = new Vector3();
const sj_AXIS_X = new Vector3(1, 0, 0);
const sj_AXIS_Y = new Vector3(0, 1, 0);
const sj_AXIS_Z = new Vector3(0, 0, 1);

/** Deterministic 0..1 hash of an integer. */
function hash01(sj_n: number): number {
  const sj_s = Math.sin(sj_n * 127.1 + 311.7) * 43758.5453;
  return sj_s - Math.floor(sj_s);
}

/** Local transform helper: position, Euler rotation (rad) and scale. */
export function T(
  sj_x = 0,
  sj_y = 0,
  sj_z = 0,
  sj_rx = 0,
  sj_ry = 0,
  sj_rz = 0,
  sj_sx = 1,
  sj_sy = sj_sx,
  sj_sz = sj_sx,
): Matrix4 {
  sj_q.setFromEuler(new Euler(sj_rx, sj_ry, sj_rz));
  return new Matrix4().compose(
    new Vector3(sj_x, sj_y, sj_z),
    sj_q,
    new Vector3(sj_sx, sj_sy, sj_sz),
  );
}

/** parent × child */
export function mul(sj_parent: Matrix4, sj_child: Matrix4): Matrix4 {
  return new Matrix4().multiplyMatrices(sj_parent, sj_child);
}

function createLatticeTexture(): CanvasTexture {
  const sj_s = 128;
  const sj_c = document.createElement('canvas');
  sj_c.width = sj_c.height = sj_s;
  const sj_ctx = sj_c.getContext('2d')!;
  sj_ctx.fillStyle = '#e9dcc0'; // paper behind the lattice
  sj_ctx.fillRect(0, 0, sj_s, sj_s);
  sj_ctx.strokeStyle = '#4e2f1f';
  sj_ctx.lineWidth = 7;
  sj_ctx.strokeRect(0, 0, sj_s, sj_s);
  sj_ctx.lineWidth = 4;
  // "cracked ice" + grid lattice
  for (let sj_i = 1; sj_i < 4; sj_i++) {
    sj_ctx.beginPath();
    sj_ctx.moveTo((sj_i * sj_s) / 4, 0);
    sj_ctx.lineTo((sj_i * sj_s) / 4, sj_s);
    sj_ctx.moveTo(0, (sj_i * sj_s) / 4);
    sj_ctx.lineTo(sj_s, (sj_i * sj_s) / 4);
    sj_ctx.stroke();
  }
  sj_ctx.lineWidth = 3;
  sj_ctx.beginPath();
  sj_ctx.moveTo(sj_s * 0.25, sj_s * 0.5);
  sj_ctx.lineTo(sj_s * 0.5, sj_s * 0.25);
  sj_ctx.lineTo(sj_s * 0.75, sj_s * 0.5);
  sj_ctx.lineTo(sj_s * 0.5, sj_s * 0.75);
  sj_ctx.closePath();
  sj_ctx.stroke();
  const sj_t = new CanvasTexture(sj_c);
  sj_t.colorSpace = SRGBColorSpace;
  sj_t.wrapS = sj_t.wrapT = RepeatWrapping;
  sj_t.needsUpdate = true;
  return sj_t;
}

/**
 * The shared material of every painted, wooden, stone and gilded part. The finish (per
 * vertex) picks the surface: lacquer with a soft sheen and faint brush marks; wood with
 * fibres and growth lines along the part's long axis (`aGrain`); stone with grain,
 * speckles and moss on top; gold that catches the sky. Every part also darkens where it
 * meets the ground, and gets a wet algae band just above the lake.
 */
function createPaintMaterial(): MeshStandardMaterial {
  const sj_paint = new MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 });
  sj_paint.name = 'arch-paint';
  sj_paint.onBeforeCompile = (sj_shader) => {
    Object.assign(sj_shader.uniforms, {
      uWaterLevel: { value: sj_WATER_LEVEL },
      uHeightMap: sj_globalUniforms.uHeightMap,
      uMaskMap: sj_globalUniforms.uMaskMap,
      uDetailMap: sj_globalUniforms.uDetailMap,
      uTerrain: sj_globalUniforms.uTerrain,
    });
    sj_shader.vertexShader = sj_shader.vertexShader
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
    sj_shader.fragmentShader = sj_shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
uniform float uWaterLevel;
varying vec2 vFinish;
varying vec3 vGrain;
varying vec3 vArchWorld;
varying vec3 vArchNormal;
${sj_NOISE_GLSL}
${sj_NOISE3_GLSL}
${sj_BUMP_GLSL}
${sj_TERRAIN_GLSL}`,
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
  sj_paint.customProgramCacheKey = () => 'arch-paint-v2';
  return sj_paint;
}

function createMaterials(): Record<Bucket, Material> {
  const sj_paint = createPaintMaterial();

  const sj_roof = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.46,
    metalness: 0.05,
  });
  sj_roof.name = 'arch-roof';
  sj_roof.onBeforeCompile = (sj_shader) => {
    sj_shader.vertexShader = sj_shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 aRoofUv;\nvarying vec2 vRoofUv;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoofUv = aRoofUv;');
    sj_shader.fragmentShader = sj_shader.fragmentShader
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
  sj_roof.customProgramCacheKey = () => 'arch-roof-v2';

  const sj_glow = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 });
  sj_glow.name = 'arch-glow';
  sj_glow.onBeforeCompile = (sj_shader) => {
    sj_shader.uniforms.uTime = sj_globalUniforms.uTime;
    sj_shader.vertexShader = sj_shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlowWorld;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvGlowWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    sj_shader.fragmentShader = sj_shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uTime;\nvarying vec3 vGlowWorld;\n${sj_NOISE_GLSL}`,
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
  sj_glow.customProgramCacheKey = () => 'arch-glow';

  const sj_lattice = new MeshStandardMaterial({
    map: createLatticeTexture(),
    vertexColors: true,
    roughness: 0.85,
  });
  sj_lattice.name = 'arch-lattice';
  return { paint: sj_paint, roof: sj_roof, glow: sj_glow, lattice: sj_lattice };
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

  light(sj_spot: LightSpot): void {
    this.lights.push(sj_spot);
  }

  /** Sky reflections on lacquer, glazed tiles and gilding. */
  setEnvironment(sj_env: Texture): void {
    const sj_intensity: Partial<Record<Bucket, number>> = {
      paint: 0.45,
      roof: 0.35,
      lattice: 0.25,
    };
    for (const [sj_bucket, sj_k] of Object.entries(sj_intensity) as [Bucket, number][]) {
      const sj_m = this.materials[sj_bucket] as MeshStandardMaterial;
      sj_m.envMap = sj_env;
      sj_m.envMapIntensity = sj_k;
      sj_m.needsUpdate = true;
    }
  }

  /**
   * Adds a part in world space. In the 'paint' bucket the part's finish (lacquer, wood,
   * stone, gilding) is taken from `sj_finish` or implied by the palette colour, each part gets
   * its own slight tone, and wood grain follows the part's longest axis.
   */
  add(
    sj_bucket: Bucket,
    sj_geometry: BufferGeometry,
    sj_color: ColorRepresentation | null,
    sj_matrix: Matrix4,
    sj_finish?: Finish,
  ): void {
    // Parts keep their shared vertices (indexed geometry): far fewer vertices to shade
    // than one copy per triangle corner. A part without normals of its own is shaded
    // flat, one normal per face, so it is split into separate triangles first.
    let sj_g =
      sj_geometry.index && !sj_geometry.attributes.normal
        ? sj_geometry.toNonIndexed()
        : sj_geometry.clone();
    if (sj_bucket === 'roof') {
      const sj_uv = sj_g.getAttribute('uv');
      if (sj_uv) sj_g.setAttribute('aRoofUv', sj_uv.clone());
      else
        sj_g.setAttribute(
          'aRoofUv',
          new BufferAttribute(new Float32Array(sj_g.attributes.position!.count * 2), 2),
        );
    }
    for (const sj_name of Object.keys(sj_g.attributes)) {
      const sj_keep =
        sj_name === 'position' ||
        sj_name === 'normal' ||
        sj_name === 'color' ||
        (sj_bucket === 'roof' && sj_name === 'aRoofUv') ||
        (sj_bucket === 'lattice' && sj_name === 'uv');
      if (!sj_keep) sj_g.deleteAttribute(sj_name);
    }
    if (!sj_g.attributes.normal) sj_g.computeVertexNormals();
    if (sj_color !== null || !sj_g.attributes.color) {
      const sj_c = new Color(sj_color ?? '#ffffff');
      const sj_arr = new Float32Array(sj_g.attributes.position!.count * 3);
      for (let sj_i = 0; sj_i < sj_arr.length; sj_i += 3)
        sj_arr.set([sj_c.r, sj_c.g, sj_c.b], sj_i);
      sj_g.setAttribute('color', new BufferAttribute(sj_arr, 3));
    }
    if (sj_bucket === 'paint') {
      const sj_id = sj_FINISH_ID[sj_finish ?? finishFor(sj_color)];
      const sj_tone = hash01(this.serial++) * 2 - 1;
      sj_g.computeBoundingBox();
      const sj_size = sj_g.boundingBox!.getSize(sj_tmpSize);
      const sj_axis =
        sj_size.x >= sj_size.y && sj_size.x >= sj_size.z
          ? sj_AXIS_X
          : sj_size.y >= sj_size.z
            ? sj_AXIS_Y
            : sj_AXIS_Z;
      sj_grain.copy(sj_axis).transformDirection(sj_matrix);
      const sj_n = sj_g.attributes.position!.count;
      const sj_fin = new Float32Array(sj_n * 2);
      const sj_gr = new Float32Array(sj_n * 3);
      for (let sj_i = 0; sj_i < sj_n; sj_i++) {
        sj_fin[sj_i * 2] = sj_id;
        sj_fin[sj_i * 2 + 1] = sj_tone;
        sj_gr[sj_i * 3] = sj_grain.x;
        sj_gr[sj_i * 3 + 1] = sj_grain.y;
        sj_gr[sj_i * 3 + 2] = sj_grain.z;
      }
      sj_g.setAttribute('aFinish', new BufferAttribute(sj_fin, 2));
      sj_g.setAttribute('aGrain', new BufferAttribute(sj_gr, 3));
    }
    sj_g = sj_g.applyMatrix4(sj_matrix);
    if (!sj_g.index) {
      const sj_n = sj_g.attributes.position!.count;
      const sj_index = new (sj_n > 65535 ? Uint32Array : Uint16Array)(sj_n);
      for (let sj_i = 0; sj_i < sj_n; sj_i++) sj_index[sj_i] = sj_i;
      sj_g.setIndex(new BufferAttribute(sj_index, 1));
    }
    this.parts[sj_bucket].push(sj_g);
  }

  /** Merges the parts: one mesh per material bucket and cell of the valley. */
  build(): Mesh[] {
    const sj_meshes: Mesh[] = [];
    for (const sj_bucket of Object.keys(this.parts) as Bucket[]) {
      const sj_cells = new Map<string, BufferGeometry[]>();
      for (const sj_g of this.parts[sj_bucket]) {
        sj_g.computeBoundingBox();
        sj_g.boundingBox!.getCenter(sj_tmpCentre);
        const sj_key = sj_SPLIT[sj_bucket]
          ? `${Math.floor(sj_tmpCentre.x / sj_CELL)},${Math.floor(sj_tmpCentre.z / sj_CELL)}`
          : 'all';
        let sj_list = sj_cells.get(sj_key);
        if (!sj_list) sj_cells.set(sj_key, (sj_list = []));
        sj_list.push(sj_g);
      }
      for (const [sj_key, sj_list] of sj_cells) {
        const sj_merged = mergeGeometries(sj_list, false);
        sj_list.forEach((sj_g) => sj_g.dispose());
        if (!sj_merged) {
          console.warn(`architecture: could not merge ${sj_bucket} @${sj_key}`);
          continue;
        }
        // centred on its own middle, so the renderer can sort it by distance
        sj_merged.computeBoundingSphere();
        const sj_centre = sj_merged.boundingSphere!.center.clone();
        sj_merged.translate(-sj_centre.x, -sj_centre.y, -sj_centre.z);
        const sj_mesh = new Mesh(sj_merged, this.materials[sj_bucket]);
        sj_mesh.name = `architecture-${sj_bucket}@${sj_key}`;
        sj_mesh.position.copy(sj_centre);
        sj_mesh.castShadow = sj_bucket !== 'glow';
        sj_mesh.receiveShadow = true;
        sj_mesh.matrixAutoUpdate = false;
        sj_mesh.updateMatrix();
        sj_meshes.push(sj_mesh);
      }
    }
    return sj_meshes;
  }
}
