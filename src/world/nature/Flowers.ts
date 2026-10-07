import {
  BufferAttribute,
  Color,
  DoubleSide,
  InstancedBufferGeometry,
  Mesh,
  MeshLambertMaterial,
  type Scene,
} from 'three';
import { sj_globalUniforms } from '../../render/uniforms';
import {
  sj_GROUND_WARP_GLSL,
  sj_NOISE_GLSL,
  sj_TERRAIN_GLSL,
  sj_VIEW_CULL_GLSL,
  sj_WIND_GLSL,
} from '../../render/glsl';

/** Unit flower: a thin stem quad and a five-petal head (position.y = 1 at the head). */
function createFlowerGeometry(): InstancedBufferGeometry {
  const sj_pos: number[] = [];
  const sj_part: number[] = [];
  const sj_idx: number[] = [];
  // stem (part 0): x = side, y = t
  sj_pos.push(-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0);
  sj_part.push(0, 0, 0, 0);
  sj_idx.push(0, 1, 2, 0, 2, 3);
  let sj_vi = 4;
  // petals (part 1): local xz in the head plane, y = 1
  for (let sj_p = 0; sj_p < 5; sj_p++) {
    const sj_a = (sj_p / 5) * Math.PI * 2;
    const sj_c = [0, 0];
    const sj_l = [Math.cos(sj_a - 0.42) * 0.42, Math.sin(sj_a - 0.42) * 0.42];
    const sj_t = [Math.cos(sj_a), Math.sin(sj_a)];
    const sj_r = [Math.cos(sj_a + 0.42) * 0.42, Math.sin(sj_a + 0.42) * 0.42];
    for (const [sj_x, sj_z] of [sj_c, sj_l, sj_t, sj_r]) {
      sj_pos.push(sj_x!, 1, sj_z!);
      sj_part.push(1);
    }
    sj_idx.push(sj_vi, sj_vi + 1, sj_vi + 2, sj_vi, sj_vi + 2, sj_vi + 3);
    sj_vi += 4;
  }
  // centre (part 2): small triangle fan
  const sj_n = 6;
  sj_pos.push(0, 1.001, 0);
  sj_part.push(2);
  const sj_centre = sj_vi;
  for (let sj_k = 0; sj_k < sj_n; sj_k++) {
    const sj_a = (sj_k / sj_n) * Math.PI * 2;
    sj_pos.push(Math.cos(sj_a) * 0.22, 1.001, Math.sin(sj_a) * 0.22);
    sj_part.push(2);
  }
  for (let sj_k = 0; sj_k < sj_n; sj_k++)
    sj_idx.push(sj_centre, sj_centre + 1 + ((sj_k + 1) % sj_n), sj_centre + 1 + sj_k);
  const sj_geo = new InstancedBufferGeometry();
  sj_geo.setAttribute('position', new BufferAttribute(new Float32Array(sj_pos), 3));
  sj_geo.setAttribute('aPart', new BufferAttribute(new Float32Array(sj_part), 1));
  const sj_normals = new Float32Array(sj_pos.length);
  for (let sj_i = 1; sj_i < sj_normals.length; sj_i += 3) sj_normals[sj_i] = 1;
  sj_geo.setAttribute('normal', new BufferAttribute(sj_normals, 3));
  sj_geo.setIndex(sj_idx);
  return sj_geo;
}

/**
 * Wildflowers scattered through the meadows in clusters, drawn like the grass as one
 * instanced patch following the panda.
 */
export class Flowers {
  readonly mesh: Mesh<InstancedBufferGeometry, MeshLambertMaterial>;
  private uniforms = { uPatch: { value: 60 }, uSide: { value: 80 } };

  constructor(sj_count: number) {
    const sj_geometry = createFlowerGeometry();
    const sj_side = Math.floor(Math.sqrt(sj_count));
    this.uniforms.uSide.value = sj_side;
    sj_geometry.instanceCount = sj_side * sj_side;
    const sj_palette = ['#f7f3ea', '#f3a9c4', '#f4d04d', '#b8a2e6', '#ee7d45', '#ffffff'].map(
      (sj_c) => new Color(sj_c),
    );
    const sj_material = new MeshLambertMaterial({ side: DoubleSide });
    sj_material.onBeforeCompile = (sj_shader) => {
      Object.assign(sj_shader.uniforms, this.uniforms, {
        uTime: sj_globalUniforms.uTime,
        uWindDir: sj_globalUniforms.uWindDir,
        uWindStrength: sj_globalUniforms.uWindStrength,
        uPlayerPos: sj_globalUniforms.uPlayerPos,
        uHeightMap: sj_globalUniforms.uHeightMap,
        uMaskMap: sj_globalUniforms.uMaskMap,
        uDetailMap: sj_globalUniforms.uDetailMap,
        uTerrain: sj_globalUniforms.uTerrain,
        uPalette: { value: sj_palette },
      });
      sj_shader.vertexShader = sj_shader.vertexShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
attribute float aPart;
uniform float uPatch;
uniform float uSide;
uniform vec3 uPlayerPos;
uniform vec3 uPalette[6];
varying vec3 vFlowerColor;
${sj_NOISE_GLSL}
${sj_GROUND_WARP_GLSL}
${sj_TERRAIN_GLSL}
${sj_WIND_GLSL}
${sj_VIEW_CULL_GLSL}`,
        )
        .replace(
          '#include <beginnormal_vertex>',
          /* glsl */ `
  float id = float(gl_InstanceID);
  vec2 cellId = vec2(mod(id, uSide), floor(id / uSide));
  vec2 local = (cellId + hash22(cellId * 2.71 + 3.0)) / uSide * uPatch - uPatch * 0.5;
  vec2 centre = uPlayerPos.xz;
  vec2 worldXZ = local + uPatch * floor((centre - local) / uPatch + 0.5);
  float ground = terrainHeightAt(worldXZ);

  // As with the grass, a flower that cannot show (outside the circle, out of view, or
  // not in a drift) is folded into a single point before the costly part.
  vec3 p = vec3(worldXZ.x, ground - 50.0, worldXZ.y);
  vFlowerColor = vec3(0.0);
  float edge = length(worldXZ - centre) / (uPatch * 0.5);
  vec3 viewCentre = (viewMatrix * vec4(worldXZ.x, ground + 0.3, worldXZ.y, 1.0)).xyz;
  if (edge < 1.0 && sphereInView(viewCentre, 0.9)) {
    float rnd = hash12(worldXZ * 5.13 + 1.9);
    float rnd2 = hash12(worldXZ * 9.71 - 4.2);
    vec4 mask = terrainMaskAt(worldXZ);
    float pathW = terrainMaskAt(worldXZ + groundWarp(worldXZ)).r;
    float bare = max(max(max(pathW, mask.g), mask.a), terrainDetailAt(worldXZ).a);
    float density = 1.0 - smoothstep(0.2, 0.5, bare);
    density *= smoothstep(0.3, 0.6, ground);
    // flowers grow in drifts
    float drift = smoothstep(0.52, 0.72, fbm(worldXZ * 0.07 + 13.0));
    density *= drift;
    if (rnd2 <= density) {
      float fade = 1.0 - smoothstep(0.75, 1.0, edge);
      float height = mix(0.22, 0.5, rnd) * fade;
      float headSize = mix(0.05, 0.085, rnd2) * step(0.001, height);

      vec2 sway = windSway(worldXZ, rnd * 5.0) * 0.08;
      vec2 away = worldXZ - uPlayerPos.xz;
      sway += normalize(away + vec2(1e-4)) * (1.0 - smoothstep(0.2, 1.1, length(away))) * 0.25;

      float yaw = rnd * 6.2831;
      vec2 f = vec2(cos(yaw), sin(yaw));
      if (aPart < 0.5) {
        float t = position.y;
        p = vec3(worldXZ + vec2(-f.y, f.x) * position.x * 0.006 + sway * t * t, ground + t * height);
        p = p.xzy;
        vFlowerColor = vec3(0.28, 0.45, 0.18);
      } else {
        vec2 hx = vec2(position.x * f.x - position.z * f.y, position.x * f.y + position.z * f.x);
        p = vec3(worldXZ.x + sway.x + hx.x * headSize, ground + height, worldXZ.y + sway.y + hx.y * headSize);
        int ci = int(floor(hash12(worldXZ * 0.37 + floor(fbm(worldXZ * 0.05) * 6.0)) * 5.99));
        vFlowerColor = aPart < 1.5 ? uPalette[ci] : vec3(0.95, 0.75, 0.2);
      }
    }
  }
  vec3 objectNormal = vec3(0.0, 1.0, 0.0);
`,
        )
        .replace('#include <begin_vertex>', 'vec3 transformed = p;');
      sj_shader.fragmentShader = sj_shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFlowerColor;')
        .replace('#include <color_fragment>', 'diffuseColor.rgb = vFlowerColor;')
        .replace(
          '#include <normal_fragment_begin>',
          /* glsl */ `
float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
vec3 normal = normalize(vNormal);
vec3 nonPerturbedNormal = normal;`,
        );
    };
    sj_material.customProgramCacheKey = () => 'flowers-v3';
    this.mesh = new Mesh(sj_geometry, sj_material);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'flowers';
  }

  addTo(sj_scene: Scene): void {
    sj_scene.add(this.mesh);
  }
}
