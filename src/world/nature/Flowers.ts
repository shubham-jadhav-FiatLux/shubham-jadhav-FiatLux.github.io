import {
  BufferAttribute,
  Color,
  DoubleSide,
  InstancedBufferGeometry,
  Mesh,
  MeshLambertMaterial,
  type Scene,
} from 'three';
import { globalUniforms } from '../../render/uniforms';
import { NOISE_GLSL, TERRAIN_GLSL, WIND_GLSL } from '../../render/glsl';

/** Unit flower: a thin stem quad and a five-petal head (position.y = 1 at the head). */
function createFlowerGeometry(): InstancedBufferGeometry {
  const pos: number[] = [];
  const part: number[] = [];
  const idx: number[] = [];
  // stem (part 0): x = side, y = t
  pos.push(-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0);
  part.push(0, 0, 0, 0);
  idx.push(0, 1, 2, 0, 2, 3);
  let vi = 4;
  // petals (part 1): local xz in the head plane, y = 1
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2;
    const c = [0, 0];
    const l = [Math.cos(a - 0.42) * 0.42, Math.sin(a - 0.42) * 0.42];
    const t = [Math.cos(a), Math.sin(a)];
    const r = [Math.cos(a + 0.42) * 0.42, Math.sin(a + 0.42) * 0.42];
    for (const [x, z] of [c, l, t, r]) {
      pos.push(x!, 1, z!);
      part.push(1);
    }
    idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    vi += 4;
  }
  // centre (part 2): small triangle fan
  const n = 6;
  pos.push(0, 1.001, 0);
  part.push(2);
  const centre = vi;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    pos.push(Math.cos(a) * 0.22, 1.001, Math.sin(a) * 0.22);
    part.push(2);
  }
  for (let k = 0; k < n; k++) idx.push(centre, centre + 1 + ((k + 1) % n), centre + 1 + k);
  const geo = new InstancedBufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('aPart', new BufferAttribute(new Float32Array(part), 1));
  const normals = new Float32Array(pos.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  geo.setAttribute('normal', new BufferAttribute(normals, 3));
  geo.setIndex(idx);
  return geo;
}

/**
 * Wildflowers scattered through the meadows in clusters, drawn like the grass as one
 * instanced patch following the panda.
 */
export class Flowers {
  readonly mesh: Mesh<InstancedBufferGeometry, MeshLambertMaterial>;
  private uniforms = { uPatch: { value: 60 }, uSide: { value: 80 } };

  constructor(count: number) {
    const geometry = createFlowerGeometry();
    const side = Math.floor(Math.sqrt(count));
    this.uniforms.uSide.value = side;
    geometry.instanceCount = side * side;
    const palette = ['#f7f3ea', '#f3a9c4', '#f4d04d', '#b8a2e6', '#ee7d45', '#ffffff'].map(
      (c) => new Color(c),
    );
    const material = new MeshLambertMaterial({ side: DoubleSide });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms, {
        uTime: globalUniforms.uTime,
        uWindDir: globalUniforms.uWindDir,
        uWindStrength: globalUniforms.uWindStrength,
        uPlayerPos: globalUniforms.uPlayerPos,
        uHeightMap: globalUniforms.uHeightMap,
        uMaskMap: globalUniforms.uMaskMap,
        uDetailMap: globalUniforms.uDetailMap,
        uTerrain: globalUniforms.uTerrain,
        uPalette: { value: palette },
      });
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
attribute float aPart;
uniform float uPatch;
uniform float uSide;
uniform vec3 uPlayerPos;
uniform vec3 uPalette[6];
varying vec3 vFlowerColor;
${NOISE_GLSL}
${TERRAIN_GLSL}
${WIND_GLSL}`,
        )
        .replace(
          '#include <beginnormal_vertex>',
          /* glsl */ `
  float id = float(gl_InstanceID);
  vec2 cellId = vec2(mod(id, uSide), floor(id / uSide));
  vec2 local = (cellId + hash22(cellId * 2.71 + 3.0)) / uSide * uPatch - uPatch * 0.5;
  vec2 centre = uPlayerPos.xz;
  vec2 worldXZ = local + uPatch * floor((centre - local) / uPatch + 0.5);
  float rnd = hash12(worldXZ * 5.13 + 1.9);
  float rnd2 = hash12(worldXZ * 9.71 - 4.2);
  float ground = terrainHeightAt(worldXZ);
  vec4 mask = terrainMaskAt(worldXZ);
  float bare = max(max(max(mask.r, mask.g), mask.a), terrainDetailAt(worldXZ).a);
  float density = 1.0 - smoothstep(0.2, 0.5, bare);
  density *= smoothstep(0.3, 0.6, ground);
  // flowers grow in drifts
  float drift = smoothstep(0.52, 0.72, fbm(worldXZ * 0.07 + 13.0));
  density *= drift;
  float edge = length(worldXZ - centre) / (uPatch * 0.5);
  float fade = 1.0 - smoothstep(0.75, 1.0, edge);
  float height = mix(0.22, 0.5, rnd) * fade * step(rnd2, density);
  float headSize = mix(0.05, 0.085, rnd2) * step(0.001, height);

  vec2 sway = windSway(worldXZ, rnd * 5.0) * 0.08;
  vec2 away = worldXZ - uPlayerPos.xz;
  sway += normalize(away + vec2(1e-4)) * (1.0 - smoothstep(0.2, 1.1, length(away))) * 0.25;

  vec3 p;
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
  vec3 objectNormal = vec3(0.0, 1.0, 0.0);
`,
        )
        .replace('#include <begin_vertex>', 'vec3 transformed = p;');
      shader.fragmentShader = shader.fragmentShader
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
    material.customProgramCacheKey = () => 'flowers-v1';
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'flowers';
  }

  addTo(scene: Scene): void {
    scene.add(this.mesh);
  }
}
