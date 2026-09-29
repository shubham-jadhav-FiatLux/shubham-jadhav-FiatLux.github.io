import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DataUtils,
  HalfFloatType,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  RedFormat,
  type Scene,
} from 'three';
import { buildHeightGrid, CELL, gridNormal, sampleGrid } from './heightfield';
import { PATHS, PLAZAS, TERRAIN_ORIGIN, TERRAIN_RES, WATER_LEVEL, type Surface } from './layout';
import { TerrainMask } from './TerrainMask';
import { globalUniforms } from '../render/uniforms';
import { NOISE_GLSL } from '../render/glsl';
import { GRASS_COLORS, GRASS_COLOR_GLSL } from './palette';

const tmpNormal = { x: 0, y: 1, z: 0 };

/**
 * The valley floor: a heightfield mesh with a procedural splat shader (grass, dirt paths,
 * flagstones, sand, moss-covered rock, caustics under the lake).
 * Also the authority for ground height and surface type queries.
 */
export class Terrain {
  readonly heights: Float32Array;
  readonly heightTexture: DataTexture;
  readonly mask: TerrainMask;
  readonly mesh: Mesh;
  readonly material: MeshStandardMaterial;

  constructor() {
    this.heights = buildHeightGrid();
    this.heightTexture = this.createHeightTexture();
    this.mask = new TerrainMask(1024);
    this.paintLayout();
    this.material = this.createMaterial();
    this.mesh = new Mesh(this.createGeometry(), this.material);
    this.mesh.name = 'terrain';
    this.mesh.receiveShadow = true;
    // Terrain does not cast: long golden-hour shadows from the rim looked noisy.
    this.mesh.castShadow = false;
    this.mesh.matrixAutoUpdate = false;
    globalUniforms.uHeightMap.value = this.heightTexture;
    globalUniforms.uMaskMap.value = this.mask.texture;
  }

  addTo(scene: Scene): void {
    scene.add(this.mesh);
  }

  /** Ground height at world (x, z), matching the rendered triangles exactly. */
  heightAt(x: number, z: number): number {
    return sampleGrid(this.heights, x, z);
  }

  normalAt(x: number, z: number, out = { x: 0, y: 1, z: 0 }) {
    return gridNormal(this.heights, x, z, out);
  }

  /** Steepness in [0, 1]: 0 = flat, 1 = vertical. */
  slopeAt(x: number, z: number): number {
    return 1 - gridNormal(this.heights, x, z, tmpNormal).y;
  }

  surfaceAt(x: number, z: number): Surface {
    const h = this.heightAt(x, z);
    if (h < WATER_LEVEL - 0.05) return 'water';
    const m = this.mask.sample(x, z);
    if (m.stone > 0.5) return 'stone';
    if (m.dirt > 0.45) return 'dirt';
    if (h < WATER_LEVEL + 0.45) return 'sand';
    return 'grass';
  }

  /** Paints paths and plazas; other systems add shade and footprints before `commit()`. */
  private paintLayout(): void {
    for (const p of PATHS) {
      this.mask.path(p.points, p.width + 0.7, 'nograss', 0.85);
      this.mask.path(p.points, p.width, 'dirt');
    }
    for (const p of PLAZAS) {
      this.mask.circle('nograss', p.x, p.z, p.radius + 0.8, 1);
      this.mask.circle(p.surface === 'stone' ? 'stone' : 'dirt', p.x, p.z, p.radius);
    }
  }

  private createHeightTexture(): DataTexture {
    const n = TERRAIN_RES;
    const half = new Uint16Array(n * n);
    for (let i = 0; i < n * n; i++) half[i] = DataUtils.toHalfFloat(this.heights[i]!);
    const tex = new DataTexture(half, n, n, RedFormat, HalfFloatType);
    tex.magFilter = LinearFilter;
    tex.minFilter = LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  private createGeometry(): BufferGeometry {
    const n = TERRAIN_RES;
    const positions = new Float32Array(n * n * 3);
    const normals = new Float32Array(n * n * 3);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const x = TERRAIN_ORIGIN + i * CELL;
        const z = TERRAIN_ORIGIN + j * CELL;
        positions[k * 3] = x;
        positions[k * 3 + 1] = this.heights[k]!;
        positions[k * 3 + 2] = z;
        const hl = this.heights[j * n + Math.max(0, i - 1)]!;
        const hr = this.heights[j * n + Math.min(n - 1, i + 1)]!;
        const hd = this.heights[Math.max(0, j - 1) * n + i]!;
        const hu = this.heights[Math.min(n - 1, j + 1) * n + i]!;
        const nx = (hl - hr) / (2 * CELL);
        const nz = (hd - hu) / (2 * CELL);
        const len = Math.hypot(nx, 1, nz);
        normals[k * 3] = nx / len;
        normals[k * 3 + 1] = 1 / len;
        normals[k * 3 + 2] = nz / len;
      }
    }
    const index = new Uint32Array((n - 1) * (n - 1) * 6);
    let o = 0;
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i; // 00
        const b = a + 1; // 10
        const c = a + n; // 01
        const d = c + 1; // 11
        // Triangles (00, 01, 10) and (01, 11, 10): counter-clockwise seen from above.
        index[o++] = a;
        index[o++] = c;
        index[o++] = b;
        index[o++] = c;
        index[o++] = d;
        index[o++] = b;
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setAttribute('normal', new BufferAttribute(normals, 3));
    geo.setIndex(new BufferAttribute(index, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }

  private createMaterial(): MeshStandardMaterial {
    const mat = new MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    const colors = {
      ...GRASS_COLORS,
      uDirtA: new Color('#b39067'),
      uDirtB: new Color('#9c7a55'),
      uStoneA: new Color('#b5aa94'),
      uStoneB: new Color('#978b78'),
      uSand: new Color('#d3bc8f'),
      uRock: new Color('#8a877b'),
      uMoss: new Color('#667842'),
      uUnderwater: new Color('#2f6f73'),
    };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uTime: globalUniforms.uTime,
        uMaskMap: globalUniforms.uMaskMap,
        uTerrain: globalUniforms.uTerrain,
      });
      for (const [k, v] of Object.entries(colors)) shader.uniforms[k] = { value: v };

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vTerrainPos;\nvarying vec3 vTerrainNormal;',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvTerrainPos = position;\nvTerrainNormal = normal;',
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
varying vec3 vTerrainPos;
varying vec3 vTerrainNormal;
uniform float uTime;
uniform sampler2D uMaskMap;
uniform vec3 uTerrain;
uniform vec3 uDirtA, uDirtB, uStoneA, uStoneB, uSand, uRock, uMoss, uUnderwater;
${NOISE_GLSL}
${GRASS_COLOR_GLSL}
// Irregular flagstones: Voronoi cells with dark grout.
vec3 flagstones(vec2 p, float n) {
  vec2 g = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  float id = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 r = o + hash22(g + o) * 0.85 - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = hash12(g + o); }
      else if (d < d2) { d2 = d; }
    }
  }
  float edge = sqrt(d2) - sqrt(d1);
  vec3 c = mix(uStoneA, uStoneB, id) * (0.9 + 0.2 * n);
  return c * mix(0.55, 1.0, smoothstep(0.03, 0.12, edge));
}
float caustics(vec2 p, float t) {
  float c = 0.0;
  vec2 q = p * 0.9;
  for (int i = 0; i < 2; i++) {
    vec2 g = floor(q);
    vec2 f = fract(q);
    float d1 = 8.0;
    float d2 = 8.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y));
        vec2 h = hash22(g + o);
        vec2 r = o + 0.5 + 0.45 * sin(t * (0.6 + 0.3 * float(i)) + 6.2831 * h) - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
      }
    }
    c += pow(1.0 - smoothstep(0.0, 0.35, sqrt(d2) - sqrt(d1)), 3.0);
    q = q * 1.7 + 3.1;
  }
  return c * 0.5;
}
vec3 terrainColor(vec3 wp, vec3 nrm) {
  vec2 xz = wp.xz;
  vec4 m = texture2D(uMaskMap, (xz - uTerrain.x) / uTerrain.y);
  float nLarge = fbm(xz * 0.045);
  float nMid = vnoise(xz * 0.55);
  float nFine = vnoise(xz * 2.7);

  vec3 grass = grassGroundColor(xz) * (0.88 + 0.22 * nMid);

  float dirt = smoothstep(0.32, 0.62, m.r + (nMid - 0.5) * 0.38);
  vec3 dirtCol = mix(uDirtA, uDirtB, nFine) * (0.9 + 0.18 * nMid);
  // pebbles along the path
  dirtCol *= 1.0 - 0.18 * step(0.82, vnoise(xz * 6.0));

  float stone = smoothstep(0.42, 0.62, m.g + (nMid - 0.5) * 0.42 + (nFine - 0.5) * 0.12);

  float sandAmt = 1.0 - smoothstep(0.18, 0.85, wp.y + (nMid - 0.5) * 0.35);
  float slope = 1.0 - nrm.y;
  float rockAmt = smoothstep(0.3, 0.48, slope + (nMid - 0.5) * 0.12);
  vec3 rockCol = mix(uRock, uMoss, smoothstep(0.35, 0.7, nLarge) * (1.0 - smoothstep(0.35, 0.7, slope)));
  // Layered strata and vertical rain streaks on cliffs.
  float strata = sin(wp.y * 2.6 + nMid * 3.0) * 0.5 + 0.5;
  float streak = vnoise(vec2(dot(xz, vec2(0.7, 0.7)) * 1.3, wp.y * 0.08));
  rockCol *= (0.78 + 0.22 * strata) * (0.8 + 0.35 * streak) * (0.88 + 0.24 * nFine);
  // Vegetation clinging to ledges.
  rockCol = mix(rockCol, uMoss * 0.85, smoothstep(0.55, 0.8, vnoise(xz * 0.4 + wp.y * 0.3)) * 0.55);

  vec3 col = grass;
  col = mix(col, uSand * (0.9 + 0.2 * nFine), sandAmt);
  col = mix(col, dirtCol, dirt);
  if (stone > 0.001) col = mix(col, flagstones(xz * 0.9, nFine), stone);
  col = mix(col, rockCol, rockAmt);
  // Baked soft contact shade under trees and buildings.
  col *= 1.0 - m.b * 0.42;
  // Wet sand darkening at the waterline.
  col *= mix(0.72, 1.0, smoothstep(-0.05, 0.3, wp.y));
  if (wp.y < 0.0) {
    float depth = -wp.y;
    col = mix(col, uUnderwater, smoothstep(0.0, 3.2, depth) * 0.75);
    col += vec3(0.85, 1.0, 0.9) * caustics(xz, uTime) * exp(-depth * 0.55) * 0.28;
  }
  return col;
}
`,
        )
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\ndiffuseColor.rgb = terrainColor(vTerrainPos, normalize(vTerrainNormal));',
        );
    };
    mat.customProgramCacheKey = () => 'terrain-v1';
    return mat;
  }
}
