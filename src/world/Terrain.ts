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
import { buildHeightGrid, CELL, gridNormal, riverCourse, sampleGrid } from './heightfield';
import {
  FALLS,
  PATHS,
  PLAZAS,
  TERRAIN_ORIGIN,
  TERRAIN_RES,
  TERRAIN_SIZE,
  WATER_LEVEL,
  type Surface,
} from './layout';
import { TerrainMask } from './TerrainMask';
import { globalUniforms } from '../render/uniforms';
import { BUMP_GLSL, GROUND_WARP_GLSL, NOISE_GLSL } from '../render/glsl';
import { ATMOSPHERE } from '../render/atmosphere';
import { smoothstep } from '../utils/math';
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
    globalUniforms.uDetailMap.value = this.mask.detailTexture;
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
    if (this.mask.sampleDetail(x, z).gravel > 0.6) return 'sand';
    const m = this.mask.sample(x, z);
    if (m.stone > 0.5) return 'stone';
    if (m.dirt > 0.45) return 'dirt';
    if (h < WATER_LEVEL + 0.45) return 'sand';
    return 'grass';
  }

  /** Paints paths and plazas; other systems add shade and footprints before `commit()`. */
  private paintLayout(): void {
    for (const p of PATHS) {
      // a light verge only: grass grows right up to the (ragged) edge of the path
      this.mask.path(p.points, p.width + 0.2, 'nograss', 0.55);
      // margins at 0.82, a brighter tread down the middle (the shader tells them apart)
      this.mask.path(p.points, p.width, 'dirt', 0.82);
      this.mask.path(p.points, p.width * 0.45, 'dirt', 1);
    }
    for (const p of PLAZAS) {
      this.mask.circle('nograss', p.x, p.z, p.radius + 0.3, 0.7);
      if (p.surface === 'stone') this.mask.circle('stone', p.x, p.z, p.radius);
      else this.mask.circle('dirt', p.x, p.z, p.radius, 0.92);
    }
    this.paintStream();
    this.paintSteepGround();
  }

  /** Gravel bed and banks along the stream, no grass under the water. */
  private paintStream(): void {
    const pts = riverCourse.points;
    for (let i = 0; i < pts.length - 1; i += 2) {
      const a = pts[i]!;
      const b = pts[Math.min(pts.length - 1, i + 2)]!;
      const seg: [number, number][] = [
        [a.x, a.z],
        [b.x, b.z],
      ];
      this.mask.path(seg, (a.halfWidth + 1.2) * 2, 'gravel', 1);
      this.mask.path(seg, (a.halfWidth + 1.9) * 2, 'gravel', 0.45);
      this.mask.path(seg, (a.halfWidth + 1.5) * 2, 'nograss', 1);
      this.mask.path(seg, (a.halfWidth + 0.6) * 2, 'wet', 0.35);
    }
    const spring = pts[0]!;
    this.mask.circle('gravel', spring.x, spring.z, 4.1, 1);
    this.mask.circle('nograss', spring.x, spring.z, 4.4, 1);
    // Spray keeps the rock and ground around the falls and the pool wet.
    const { lip, foot } = FALLS;
    this.mask.path(
      [
        [lip.x, lip.z],
        [foot.x, foot.z],
      ],
      6,
      'wet',
      0.9,
    );
    this.mask.blob('wet', foot.x, foot.z, 9, 0.85);
  }

  /** No grass on cliffs and steep banks (it looked pinned to the rock). */
  private paintSteepGround(): void {
    const n = TERRAIN_RES;
    const slope = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = TERRAIN_ORIGIN + i * CELL;
        const z = TERRAIN_ORIGIN + j * CELL;
        slope[j * n + i] = 1 - gridNormal(this.heights, x, z, tmpNormal).y;
      }
    }
    const at = (x: number, z: number) => {
      const fx = Math.min(n - 1.001, Math.max(0, (x - TERRAIN_ORIGIN) / CELL));
      const fz = Math.min(n - 1.001, Math.max(0, (z - TERRAIN_ORIGIN) / CELL));
      const i = Math.floor(fx);
      const j = Math.floor(fz);
      const u = fx - i;
      const v = fz - j;
      const s00 = slope[j * n + i]!;
      const s10 = slope[j * n + i + 1]!;
      const s01 = slope[(j + 1) * n + i]!;
      const s11 = slope[(j + 1) * n + i + 1]!;
      return (s00 * (1 - u) + s10 * u) * (1 - v) + (s01 * (1 - u) + s11 * u) * v;
    };
    const half = TERRAIN_SIZE / 2;
    this.mask.field('nograss', { x0: -half, z0: -half, x1: half, z1: half }, (x, z) =>
      smoothstep(0.3, 0.5, at(x, z)),
    );
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
      uRock: new Color('#8f8574'),
      uMoss: new Color('#5f7540'),
      uUnderwater: new Color('#2f6f73'),
      uGravelA: new Color('#a4998a'),
      uGravelB: new Color('#7f786c'),
      uLitterA: new Color('#a7803f'),
      uLitterB: new Color('#7b5a33'),
      // warm glow that lanterns cast on the ground (emissive, HDR)
      uLampLight: ATMOSPHERE.lampLight,
    };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uTime: globalUniforms.uTime,
        uMaskMap: globalUniforms.uMaskMap,
        uDetailMap: globalUniforms.uDetailMap,
        uTerrain: globalUniforms.uTerrain,
        uRipple: globalUniforms.uRipple,
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
uniform sampler2D uDetailMap;
uniform vec3 uTerrain;
uniform vec4 uRipple;
uniform vec3 uDirtA, uDirtB, uStoneA, uStoneB, uSand, uRock, uMoss, uUnderwater;
uniform vec3 uGravelA, uGravelB, uLitterA, uLitterB, uLampLight;
// set by terrainColor(), used later for roughness, relief and glow
float terrainWet = 0.0;
float terrainLight = 0.0;
float terrainRelief = 0.0;
${NOISE_GLSL}
${GROUND_WARP_GLSL}
${BUMP_GLSL}
${GRASS_COLOR_GLSL}
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
  float nLarge = fbm(xz * 0.045);
  float nMid = vnoise(xz * 0.55);
  float nFine = vnoise(xz * 2.7);

  // small-scale raggedness for every edge between materials
  float nRag = vnoise(xz * 4.3);
  vec3 grass = grassGroundColor(xz) * (0.88 + 0.22 * nMid);

  // Dirt paths and yards (looked up with a meandering offset). The mask is brighter down
  // the middle of a path: a compacted, darker tread with dusty, lighter margins.
  float mr = texture2D(uMaskMap, (xz + groundWarp(xz) - uTerrain.x) / uTerrain.y).r;
  float dirt = smoothstep(0.3, 0.6, mr + (nMid - 0.5) * 0.36 + (nRag - 0.5) * 0.2);
  float tread = smoothstep(0.86, 0.98, mr);
  vec3 dirtCol = mix(uDirtA, uDirtB, nFine) * (0.9 + 0.18 * nMid) * (0.94 + 0.12 * nLarge);
  dirtCol *= mix(1.05, 0.88, tread);

  // Verge: trampled, drier grass with soil showing through in patches.
  float verge = smoothstep(0.06, 0.32, mr + (nRag - 0.5) * 0.12) * (1.0 - dirt);
  vec3 worn = mix(grass, uGrassDry * 0.85, 0.4);
  float soilPatch = smoothstep(0.5, 0.72, vnoise(xz * 3.3) * 0.7 + verge * 0.5);
  worn = mix(worn, dirtCol * 0.92, soilPatch * 0.85);

  float sandAmt = 1.0 - smoothstep(0.18, 0.85, wp.y + (nMid - 0.5) * 0.35 + (nRag - 0.5) * 0.12);
  float ripplesS = sin(dot(xz, vec2(2.3, 1.1)) * 3.1 + vnoise(xz * 0.9) * 4.0) * 0.5 + 0.5;
  vec3 sandCol = uSand * (0.9 + 0.2 * nFine) * (0.95 + 0.07 * ripplesS);
  float slope = 1.0 - nrm.y;
  float rockAmt = smoothstep(0.3, 0.48, slope + (nMid - 0.5) * 0.12);
  // scree gathering at the foot of steep ground
  float talus = smoothstep(0.2, 0.3, slope + (nMid - 0.5) * 0.1) * (1.0 - rockAmt);

  // Cliff rock: layered strata with lit ledges, shadowed undercuts and vertical joints.
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
  terrainRelief = rockAmt * (band * 0.4 - undercut * 0.3 - joint * 0.25 + nFine * 0.08);

  vec3 col = grass;
  col = mix(col, sandCol, sandAmt);
  // where beach meets meadow: patches of dry grass holding the sand
  float shore = sandAmt * (1.0 - sandAmt) * 4.0;
  col = mix(col, mix(grass, uGrassDry, 0.55), shore * smoothstep(0.42, 0.68, vnoise(xz * 2.1 + 5.0)) * 0.65);
  col = mix(col, mix(uGravelA, uGravelB, nFine) * 0.85, talus * 0.5);
  col = mix(col, worn, verge);
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
  float litter = det.b * smoothstep(0.3, 0.75, vnoise(xz * 2.3) * 0.6 + nFine * 0.55);
  col = mix(col, mix(uLitterA, uLitterB, vnoise(xz * 7.0)), litter * 0.7);

  col = mix(col, rockCol, rockAmt);
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
    mat.customProgramCacheKey = () => 'terrain-v5';
    return mat;
  }
}
