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
import { buildHeightGrid, sj_CELL, gridNormal, sj_riverCourse, sampleGrid } from './heightfield';
import {
  sj_FALLS,
  sj_PATHS,
  sj_PLAZAS,
  sj_TERRAIN_ORIGIN,
  sj_TERRAIN_RES,
  sj_TERRAIN_SIZE,
  sj_WATER_LEVEL,
  type Surface,
} from './layout';
import { TerrainMask } from './TerrainMask';
import { sj_globalUniforms } from '../render/uniforms';
import { sj_BUMP_GLSL, sj_GROUND_WARP_GLSL, sj_NOISE_GLSL } from '../render/glsl';
import { sj_ATMOSPHERE } from '../render/atmosphere';
import { smoothstep } from '../utils/math';
import { sj_GRASS_COLORS, sj_GRASS_COLOR_GLSL } from './palette';

const sj_tmpNormal = { x: 0, y: 1, z: 0 };

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
    sj_globalUniforms.uHeightMap.value = this.heightTexture;
    sj_globalUniforms.uMaskMap.value = this.mask.texture;
    sj_globalUniforms.uDetailMap.value = this.mask.detailTexture;
  }

  addTo(sj_scene: Scene): void {
    sj_scene.add(this.mesh);
  }

  /** Ground height at world (x, z), matching the rendered triangles exactly. */
  heightAt(sj_x: number, sj_z: number): number {
    return sampleGrid(this.heights, sj_x, sj_z);
  }

  normalAt(sj_x: number, sj_z: number, sj_out = { x: 0, y: 1, z: 0 }) {
    return gridNormal(this.heights, sj_x, sj_z, sj_out);
  }

  /** Steepness in [0, 1]: 0 = flat, 1 = vertical. */
  slopeAt(sj_x: number, sj_z: number): number {
    return 1 - gridNormal(this.heights, sj_x, sj_z, sj_tmpNormal).y;
  }

  surfaceAt(sj_x: number, sj_z: number): Surface {
    const sj_h = this.heightAt(sj_x, sj_z);
    if (sj_h < sj_WATER_LEVEL - 0.05) return 'water';
    if (this.mask.sampleDetail(sj_x, sj_z).gravel > 0.6) return 'sand';
    const sj_m = this.mask.sample(sj_x, sj_z);
    if (sj_m.stone > 0.5) return 'stone';
    if (sj_m.dirt > 0.45) return 'dirt';
    if (sj_h < sj_WATER_LEVEL + 0.45) return 'sand';
    return 'grass';
  }

  /** Paints paths and plazas; other systems add shade and footprints before `commit()`. */
  private paintLayout(): void {
    for (const sj_p of sj_PATHS) {
      // a light verge only: grass grows right up to the (ragged) edge of the path
      this.mask.path(sj_p.points, sj_p.width + 0.2, 'nograss', 0.55);
      // margins at 0.82, a brighter tread down the middle (the shader tells them apart)
      this.mask.path(sj_p.points, sj_p.width, 'dirt', 0.82);
      this.mask.path(sj_p.points, sj_p.width * 0.45, 'dirt', 1);
    }
    for (const sj_p of sj_PLAZAS) {
      this.mask.circle('nograss', sj_p.x, sj_p.z, sj_p.radius + 0.3, 0.7);
      if (sj_p.surface === 'stone') this.mask.circle('stone', sj_p.x, sj_p.z, sj_p.radius);
      else this.mask.circle('dirt', sj_p.x, sj_p.z, sj_p.radius, 0.92);
    }
    this.paintStream();
    this.paintSteepGround();
  }

  /** Gravel bed and banks along the stream, no grass under the water. */
  private paintStream(): void {
    const sj_pts = sj_riverCourse.points;
    for (let sj_i = 0; sj_i < sj_pts.length - 1; sj_i += 2) {
      const sj_a = sj_pts[sj_i]!;
      const sj_b = sj_pts[Math.min(sj_pts.length - 1, sj_i + 2)]!;
      const sj_seg: [number, number][] = [
        [sj_a.x, sj_a.z],
        [sj_b.x, sj_b.z],
      ];
      this.mask.path(sj_seg, (sj_a.halfWidth + 1.2) * 2, 'gravel', 1);
      this.mask.path(sj_seg, (sj_a.halfWidth + 1.9) * 2, 'gravel', 0.45);
      this.mask.path(sj_seg, (sj_a.halfWidth + 1.5) * 2, 'nograss', 1);
      this.mask.path(sj_seg, (sj_a.halfWidth + 0.6) * 2, 'wet', 0.35);
    }
    const sj_spring = sj_pts[0]!;
    this.mask.circle('gravel', sj_spring.x, sj_spring.z, 4.1, 1);
    this.mask.circle('nograss', sj_spring.x, sj_spring.z, 4.4, 1);
    // Spray keeps the rock and ground around the falls and the pool wet.
    const { lip: sj_lip, foot: sj_foot } = sj_FALLS;
    this.mask.path(
      [
        [sj_lip.x, sj_lip.z],
        [sj_foot.x, sj_foot.z],
      ],
      6,
      'wet',
      0.9,
    );
    this.mask.blob('wet', sj_foot.x, sj_foot.z, 9, 0.85);
  }

  /** No grass on cliffs and steep banks (it looked pinned to the rock). */
  private paintSteepGround(): void {
    const sj_n = sj_TERRAIN_RES;
    const sj_slope = new Float32Array(sj_n * sj_n);
    for (let sj_j = 0; sj_j < sj_n; sj_j++) {
      for (let sj_i = 0; sj_i < sj_n; sj_i++) {
        const sj_x = sj_TERRAIN_ORIGIN + sj_i * sj_CELL;
        const sj_z = sj_TERRAIN_ORIGIN + sj_j * sj_CELL;
        sj_slope[sj_j * sj_n + sj_i] = 1 - gridNormal(this.heights, sj_x, sj_z, sj_tmpNormal).y;
      }
    }
    const sj_at = (sj_x: number, sj_z: number) => {
      const sj_fx = Math.min(sj_n - 1.001, Math.max(0, (sj_x - sj_TERRAIN_ORIGIN) / sj_CELL));
      const sj_fz = Math.min(sj_n - 1.001, Math.max(0, (sj_z - sj_TERRAIN_ORIGIN) / sj_CELL));
      const sj_i = Math.floor(sj_fx);
      const sj_j = Math.floor(sj_fz);
      const sj_u = sj_fx - sj_i;
      const sj_v = sj_fz - sj_j;
      const sj_s00 = sj_slope[sj_j * sj_n + sj_i]!;
      const sj_s10 = sj_slope[sj_j * sj_n + sj_i + 1]!;
      const sj_s01 = sj_slope[(sj_j + 1) * sj_n + sj_i]!;
      const sj_s11 = sj_slope[(sj_j + 1) * sj_n + sj_i + 1]!;
      return (
        (sj_s00 * (1 - sj_u) + sj_s10 * sj_u) * (1 - sj_v) +
        (sj_s01 * (1 - sj_u) + sj_s11 * sj_u) * sj_v
      );
    };
    const sj_half = sj_TERRAIN_SIZE / 2;
    this.mask.field(
      'nograss',
      { x0: -sj_half, z0: -sj_half, x1: sj_half, z1: sj_half },
      (sj_x, sj_z) => smoothstep(0.3, 0.5, sj_at(sj_x, sj_z)),
    );
  }

  private createHeightTexture(): DataTexture {
    const sj_n = sj_TERRAIN_RES;
    const sj_half = new Uint16Array(sj_n * sj_n);
    for (let sj_i = 0; sj_i < sj_n * sj_n; sj_i++)
      sj_half[sj_i] = DataUtils.toHalfFloat(this.heights[sj_i]!);
    const sj_tex = new DataTexture(sj_half, sj_n, sj_n, RedFormat, HalfFloatType);
    sj_tex.magFilter = LinearFilter;
    sj_tex.minFilter = LinearFilter;
    sj_tex.generateMipmaps = false;
    sj_tex.needsUpdate = true;
    return sj_tex;
  }

  private createGeometry(): BufferGeometry {
    const sj_n = sj_TERRAIN_RES;
    const sj_positions = new Float32Array(sj_n * sj_n * 3);
    const sj_normals = new Float32Array(sj_n * sj_n * 3);
    for (let sj_j = 0; sj_j < sj_n; sj_j++) {
      for (let sj_i = 0; sj_i < sj_n; sj_i++) {
        const sj_k = sj_j * sj_n + sj_i;
        const sj_x = sj_TERRAIN_ORIGIN + sj_i * sj_CELL;
        const sj_z = sj_TERRAIN_ORIGIN + sj_j * sj_CELL;
        sj_positions[sj_k * 3] = sj_x;
        sj_positions[sj_k * 3 + 1] = this.heights[sj_k]!;
        sj_positions[sj_k * 3 + 2] = sj_z;
        const sj_hl = this.heights[sj_j * sj_n + Math.max(0, sj_i - 1)]!;
        const sj_hr = this.heights[sj_j * sj_n + Math.min(sj_n - 1, sj_i + 1)]!;
        const sj_hd = this.heights[Math.max(0, sj_j - 1) * sj_n + sj_i]!;
        const sj_hu = this.heights[Math.min(sj_n - 1, sj_j + 1) * sj_n + sj_i]!;
        const sj_nx = (sj_hl - sj_hr) / (2 * sj_CELL);
        const sj_nz = (sj_hd - sj_hu) / (2 * sj_CELL);
        const sj_len = Math.hypot(sj_nx, 1, sj_nz);
        sj_normals[sj_k * 3] = sj_nx / sj_len;
        sj_normals[sj_k * 3 + 1] = 1 / sj_len;
        sj_normals[sj_k * 3 + 2] = sj_nz / sj_len;
      }
    }
    const sj_index = new Uint32Array((sj_n - 1) * (sj_n - 1) * 6);
    let sj_o = 0;
    for (let sj_j = 0; sj_j < sj_n - 1; sj_j++) {
      for (let sj_i = 0; sj_i < sj_n - 1; sj_i++) {
        const sj_a = sj_j * sj_n + sj_i; // 00
        const sj_b = sj_a + 1; // 10
        const sj_c = sj_a + sj_n; // 01
        const sj_d = sj_c + 1; // 11
        // Triangles (00, 01, 10) and (01, 11, 10): counter-clockwise seen from above.
        sj_index[sj_o++] = sj_a;
        sj_index[sj_o++] = sj_c;
        sj_index[sj_o++] = sj_b;
        sj_index[sj_o++] = sj_c;
        sj_index[sj_o++] = sj_d;
        sj_index[sj_o++] = sj_b;
      }
    }
    const sj_geo = new BufferGeometry();
    sj_geo.setAttribute('position', new BufferAttribute(sj_positions, 3));
    sj_geo.setAttribute('normal', new BufferAttribute(sj_normals, 3));
    sj_geo.setIndex(new BufferAttribute(sj_index, 1));
    sj_geo.computeBoundingSphere();
    sj_geo.computeBoundingBox();
    return sj_geo;
  }

  private createMaterial(): MeshStandardMaterial {
    const sj_mat = new MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    const sj_colors = {
      ...sj_GRASS_COLORS,
      uDirtA: new Color('#b39067'),
      uDirtB: new Color('#9c7a55'),
      uStoneA: new Color('#b5aa94'),
      uStoneB: new Color('#978b78'),
      uSand: new Color('#d3bc8f'),
      uRock: new Color('#8f8574'),
      uMoss: new Color('#5f7540'),
      uUnderwater: new Color('#2f6f73'),
      uGravelA: new Color('#a4998a'),
      uGravelB: new Color('#7f786c'),
      uLitterA: new Color('#a7803f'),
      uLitterB: new Color('#7b5a33'),
      // warm glow that lanterns cast on the ground (emissive, HDR)
      uLampLight: sj_ATMOSPHERE.lampLight,
    };
    sj_mat.onBeforeCompile = (sj_shader) => {
      Object.assign(sj_shader.uniforms, {
        uTime: sj_globalUniforms.uTime,
        uMaskMap: sj_globalUniforms.uMaskMap,
        uDetailMap: sj_globalUniforms.uDetailMap,
        uTerrain: sj_globalUniforms.uTerrain,
        uRipple: sj_globalUniforms.uRipple,
      });
      for (const [sj_k, sj_v] of Object.entries(sj_colors))
        sj_shader.uniforms[sj_k] = { value: sj_v };

      sj_shader.vertexShader = sj_shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vTerrainPos;\nvarying vec3 vTerrainNormal;',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvTerrainPos = position;\nvTerrainNormal = normal;',
        );

      sj_shader.fragmentShader = sj_shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
varying vec3 vTerrainPos;
varying vec3 vTerrainNormal;
uniform float uTime;
uniform sampler2D uMaskMap;
uniform sampler2D uDetailMap;
uniform vec3 uTerrain;
uniform vec4 uRipple;
uniform vec3 uDirtA, uDirtB, uStoneA, uStoneB, uSand, uRock, uMoss, uUnderwater;
uniform vec3 uGravelA, uGravelB, uLitterA, uLitterB, uLampLight;
// set by terrainColor(), used later for roughness, relief and glow
float terrainWet = 0.0;
float terrainLight = 0.0;
float terrainRelief = 0.0;
${sj_NOISE_GLSL}
${sj_GROUND_WARP_GLSL}
${sj_BUMP_GLSL}
${sj_GRASS_COLOR_GLSL}
// Golden ink ring of a discovery, spreading over the ground.
float inkRipple(vec2 xz) {
  float age = uRipple.z;
  if (age > 3.0) return 0.0;
  float r = length(xz - uRipple.xy);
  float front = age * 7.5;
  float wobble = vnoise(xz * 1.7 + age) * 0.9;
  float ring = exp(-pow((r - front + wobble) * 1.4, 2.0));
  float inner = smoothstep(front, 0.0, r) * 0.25;
  return (ring + inner) * exp(-age * 1.1) * uRipple.w;
}
// Irregular flagstones (Voronoi cells). Returns the distance to the joint, the stone's id
// and the stone's centre in world xz (to decide stone by stone whether it is laid).
vec4 flagstoneCell(vec2 xz) {
  vec2 p = xz * 0.9;
  vec2 g = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  float id = 0.0;
  vec2 centre = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 h = hash22(g + o) * 0.85;
      vec2 r = o + h - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = hash12(g + o); centre = g + o + h; }
      else if (d < d2) { d2 = d; }
    }
  }
  return vec4(sqrt(d2) - sqrt(d1), id, centre / 0.9);
}
// Scattered small stones: some Voronoi cells hold one. Returns the coverage; h is the
// height of the little dome (for relief), sid a per-stone random tint.
float scatteredStones(vec2 p, float amount, out float h, out float sid) {
  vec2 g = floor(p);
  vec2 f = fract(p);
  float cover = 0.0;
  h = 0.0;
  sid = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 cell = g + o;
      if (hash12(cell + 3.7) > amount) continue;
      vec2 c = o + 0.25 + 0.5 * hash22(cell) - f;
      float r = 0.13 + 0.17 * hash12(cell + 9.1);
      float d = length(c * vec2(1.0, 1.3)) / r;
      float dome = 1.0 - smoothstep(0.72, 1.0, d);
      if (dome > cover) {
        cover = dome;
        h = sqrt(max(0.0, 1.0 - d * d));
        sid = hash12(cell + 1.3);
      }
    }
  }
  return cover;
}
// Rounded pebbles: Voronoi cells shaded as little domes with dark gaps.
float pebbles(vec2 p) {
  vec2 g = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float id = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 r = o + 0.1 + hash22(g + o) * 0.8 - f;
      float d = dot(r, r);
      if (d < d1) { d1 = d; id = hash12(g + o); }
    }
  }
  return (1.0 - smoothstep(0.1, 0.48, sqrt(d1))) * (0.7 + 0.6 * id);
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
  vec2 muv = (xz - uTerrain.x) / uTerrain.y;
  vec4 m = texture2D(uMaskMap, muv);
  vec4 det = texture2D(uDetailMap, muv);
  float nMid = vnoise(xz * 0.55);
  float nFine = vnoise(xz * 2.7);

  // small-scale raggedness for every edge between materials
  float nRag = vnoise(xz * 4.3);
  vec3 grass = grassGroundColor(xz) * (0.88 + 0.22 * nMid);

  // How much of each material this point gets. Most of the valley is plain meadow, so
  // each material's (costly) colour below is only worked out where it shows: mixing in
  // a material by exactly zero leaves the colour exactly as it was.
  // Dirt paths and yards (looked up with a meandering offset). The mask is brighter down
  // the middle of a path: a compacted, darker tread with dusty, lighter margins.
  float mr = texture2D(uMaskMap, (xz + groundWarp(xz) - uTerrain.x) / uTerrain.y).r;
  float dirt = smoothstep(0.3, 0.6, mr + (nMid - 0.5) * 0.36 + (nRag - 0.5) * 0.2);
  // Verge: trampled, drier grass with soil showing through in patches.
  float verge = smoothstep(0.06, 0.32, mr + (nRag - 0.5) * 0.12) * (1.0 - dirt);
  float sandAmt = 1.0 - smoothstep(0.18, 0.85, wp.y + (nMid - 0.5) * 0.35 + (nRag - 0.5) * 0.12);
  float slope = 1.0 - nrm.y;
  float rockAmt = smoothstep(0.3, 0.48, slope + (nMid - 0.5) * 0.12);
  // scree gathering at the foot of steep ground
  float talus = smoothstep(0.2, 0.3, slope + (nMid - 0.5) * 0.1) * (1.0 - rockAmt);

  float nLarge = 0.0;
  if (dirt > 0.0 || verge > 0.0 || rockAmt > 0.0) nLarge = fbm(xz * 0.045);
  float tread = smoothstep(0.86, 0.98, mr);
  vec3 dirtCol = mix(uDirtA, uDirtB, nFine) * (0.9 + 0.18 * nMid) * (0.94 + 0.12 * nLarge);
  dirtCol *= mix(1.05, 0.88, tread);

  vec3 col = grass;
  if (sandAmt > 0.0) {
    float ripplesS = sin(dot(xz, vec2(2.3, 1.1)) * 3.1 + vnoise(xz * 0.9) * 4.0) * 0.5 + 0.5;
    vec3 sandCol = uSand * (0.9 + 0.2 * nFine) * (0.95 + 0.07 * ripplesS);
    col = mix(col, sandCol, sandAmt);
    // where beach meets meadow: patches of dry grass holding the sand
    float shore = sandAmt * (1.0 - sandAmt) * 4.0;
    col = mix(col, mix(grass, uGrassDry, 0.55), shore * smoothstep(0.42, 0.68, vnoise(xz * 2.1 + 5.0)) * 0.65);
  }
  col = mix(col, mix(uGravelA, uGravelB, nFine) * 0.85, talus * 0.5);
  if (verge > 0.0) {
    vec3 worn = mix(grass, uGrassDry * 0.85, 0.4);
    float soilPatch = smoothstep(0.5, 0.72, vnoise(xz * 3.3) * 0.7 + verge * 0.5);
    worn = mix(worn, dirtCol * 0.92, soilPatch * 0.85);
    col = mix(col, worn, verge);
  }
  col = mix(col, dirtCol, dirt);

  // Pebbles and grit: along the margins of paths, on the upper beach and in the scree.
  float gritAmt = (dirt * mix(0.12, 0.03, tread) + sandAmt * 0.06 + talus * 0.3)
    * (0.3 + 1.2 * smoothstep(0.3, 0.75, vnoise(xz * 0.8 + 11.0)));
  if (gritAmt > 0.004) {
    float sh;
    float sid;
    float grit = scatteredStones(xz * 3.2, gritAmt, sh, sid);
    vec3 pc = mix(mix(uGravelA, uStoneA, 0.6), uGravelB, sid * 0.7);
    pc *= mix(vec3(1.0), vec3(1.05, 0.97, 0.88), step(0.6, sid));
    col = mix(col, pc * (0.82 + 0.3 * sh), grit);
    terrainRelief += grit * sh * 0.08;
  }

  // Flagstones, laid stone by stone: towards the edge of the paving some are missing and
  // moss creeps into the joints, so the paving frays into the ground around it.
  if (m.g > 0.02) {
    vec4 fc = flagstoneCell(xz);
    float laidMask = texture2D(uMaskMap, (fc.zw - uTerrain.x) / uTerrain.y).g;
    float laid = step(0.45 + 0.3 * (hash12(fc.zw * 1.7) - 0.5), laidMask);
    float edgeZone = 1.0 - smoothstep(0.6, 0.95, m.g);
    vec3 sc = mix(uStoneA, uStoneB, fc.y) * (0.9 + 0.2 * nFine);
    // worn, lighter middles and darker rims on each stone
    sc *= 0.88 + 0.16 * smoothstep(0.04, 0.4, fc.x);
    vec3 grout = mix(sc * 0.5, uMoss * 0.7, 0.25 + 0.65 * edgeZone);
    float joint2 = smoothstep(0.03, 0.1, fc.x);
    col = mix(col, mix(grout, sc, joint2), laid);
    terrainRelief += laid * (joint2 * 0.05 - 0.02);
  }

  // Gravel stream beds and pebbly banks.
  float gravel = smoothstep(0.12, 0.55, det.a + (nMid - 0.5) * 0.35);
  if (gravel > 0.001) {
    vec3 gcol = mix(uGravelA, uGravelB, nMid) * (0.62 + 0.42 * pebbles(xz * 4.3));
    gcol = mix(gcol, uMoss * 0.8, smoothstep(0.6, 0.85, nFine) * 0.35);
    col = mix(col, gcol, gravel);
  }
  // Fallen leaves under bamboo and trees.
  if (det.b > 0.0) {
    float litter = det.b * smoothstep(0.3, 0.75, vnoise(xz * 2.3) * 0.6 + nFine * 0.55);
    col = mix(col, mix(uLitterA, uLitterB, vnoise(xz * 7.0)), litter * 0.7);
  }

  // Cliff rock: layered strata with lit ledges, shadowed undercuts and vertical joints.
  if (rockAmt > 0.0) {
    float layerY = wp.y * (0.5 + 0.28 * vnoise(xz * 0.03)) + nLarge * 2.6 + vnoise(xz * 0.15) * 1.2;
    float band = fract(layerY);
    float layerId = floor(layerY);
    float tone = hash12(vec2(layerId, 7.1));
    float ledge = smoothstep(0.0, 0.05, band) * (1.0 - smoothstep(0.05, 0.2, band));
    // ledges come and go along the cliff instead of running on forever
    ledge *= smoothstep(0.3, 0.6, vnoise(vec2(dot(xz, vec2(0.6, 0.8)) * 0.25, layerId * 1.3)));
    float undercut = smoothstep(0.7, 0.98, band);
    float joint = smoothstep(0.88, 0.97,
      vnoise(vec2(dot(xz, vec2(0.71, -0.71)) * 1.3 + layerId * 5.3, layerId * 1.7)));
    float streak = vnoise(vec2(dot(xz, vec2(0.7, 0.7)) * 1.3, wp.y * 0.08));
    vec3 rockCol = mix(uRock, uMoss, smoothstep(0.35, 0.7, nLarge) * (1.0 - smoothstep(0.35, 0.7, slope)));
    rockCol *= (0.8 + 0.3 * tone) * (0.84 + 0.3 * streak) * (0.9 + 0.2 * nFine);
    rockCol *= 1.0 + ledge * 0.3 - undercut * 0.34 - joint * 0.32;
    // cooler grey patches and rusty seep stains
    rockCol *= mix(vec3(1.0), vec3(0.82, 0.86, 0.9), smoothstep(0.5, 0.8, fbm(xz * 0.06 + wp.y * 0.05)));
    float seep = smoothstep(0.7, 0.9, vnoise(vec2(dot(xz, vec2(0.7, 0.7)) * 0.9, wp.y * 0.04 + 3.0)));
    rockCol = mix(rockCol, rockCol * vec3(0.95, 0.72, 0.52), seep * 0.5);
    // Moss and little plants clinging to the ledges.
    float ledgeMoss = ledge * smoothstep(0.4, 0.7, vnoise(xz * 0.9 + layerId * 2.3));
    rockCol = mix(rockCol, uMoss * (0.75 + 0.35 * nFine), ledgeMoss * 0.85);
    rockCol = mix(rockCol, uMoss * 0.85, smoothstep(0.55, 0.8, vnoise(xz * 0.4 + wp.y * 0.3)) * 0.45);
    terrainRelief += rockAmt * (band * 0.4 - undercut * 0.3 - joint * 0.25 + nFine * 0.08);
    col = mix(col, rockCol, rockAmt);
  }
  // Baked soft contact shade under trees and buildings.
  col *= 1.0 - m.b * 0.42;
  // Wet ground and rock around the falls and the stream: darker, a little green.
  terrainWet = det.g;
  col *= mix(vec3(1.0), vec3(0.56, 0.63, 0.58), det.g);
  terrainLight = det.r;
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
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.42, terrainWet);',
        )
        .replace(
          '#include <normal_fragment_maps>',
          '#include <normal_fragment_maps>\nnormal = bumpFromHeight(-vViewPosition, normal, terrainRelief * 0.5);',
        )
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.6, 1.1, 0.45) * inkRipple(vTerrainPos.xz) + uLampLight * terrainLight;',
        );
    };
    sj_mat.customProgramCacheKey = () => 'terrain-v6';
    return sj_mat;
  }
}
