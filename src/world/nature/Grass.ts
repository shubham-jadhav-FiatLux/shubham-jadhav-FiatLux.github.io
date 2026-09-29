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
import { GRASS_COLORS, GRASS_COLOR_GLSL } from '../palette';
import { ATMOSPHERE } from '../../render/atmosphere';
import type { QualitySettings } from '../../core/Quality';

const SEGMENTS = 4;

function createBladeGeometry(): InstancedBufferGeometry {
  // position.x = side (-1..1), position.y = t along the blade (0..1)
  const verts: number[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const t = i / SEGMENTS;
    verts.push(-1, t, 0, 1, t, 0);
  }
  verts.push(0, 1, 0);
  const index: number[] = [];
  for (let i = 0; i < SEGMENTS - 1; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const last = (SEGMENTS - 1) * 2;
  index.push(last, last + 1, SEGMENTS * 2);
  const geo = new InstancedBufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
  // Lighting uses an up-facing normal so blades shade like the ground beneath them.
  const normals = new Float32Array(verts.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  geo.setAttribute('normal', new BufferAttribute(normals, 3));
  geo.setIndex(index);
  return geo;
}

/**
 * Wind-blown grass rendered as one instanced draw call. A square patch of blades follows
 * the panda; each blade maps to a fixed spot on a world lattice, so blades never swim.
 * Height, density and colour come from the terrain textures on the GPU. Blades bend away
 * from the panda and are flattened by the spin-kick shock-wave.
 */
export class Grass {
  readonly mesh: Mesh<InstancedBufferGeometry, MeshLambertMaterial>;
  private uniforms = {
    uPatch: { value: 40 },
    uSide: { value: 200 },
  };

  constructor(settings: QualitySettings) {
    const geometry = createBladeGeometry();
    const material = new MeshLambertMaterial({ side: DoubleSide });
    const tipColor = GRASS_COLORS.uGrassTip;
    const sunColor = new Color().copy(ATMOSPHERE.sunColor);
    material.onBeforeCompile = (shader) => {
      for (const [k, v] of Object.entries(GRASS_COLORS)) shader.uniforms[k] = { value: v };
      Object.assign(shader.uniforms, this.uniforms, {
        uTime: globalUniforms.uTime,
        uWindDir: globalUniforms.uWindDir,
        uWindStrength: globalUniforms.uWindStrength,
        uPlayerPos: globalUniforms.uPlayerPos,
        uShockwave: globalUniforms.uShockwave,
        uShockAge: globalUniforms.uShockAge,
        uHeightMap: globalUniforms.uHeightMap,
        uMaskMap: globalUniforms.uMaskMap,
        uTerrain: globalUniforms.uTerrain,
        uTip: { value: tipColor },
        uSunColor: { value: sunColor },
        uSunDir: globalUniforms.uSunDir,
      });
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
uniform float uPatch;
uniform float uSide;
uniform vec3 uPlayerPos;
uniform vec3 uShockwave;
uniform float uShockAge;
uniform vec3 uTip;
uniform vec3 uSunDir;
varying vec3 vGrassColor;
varying float vGrassTrans;
${NOISE_GLSL}
${TERRAIN_GLSL}
${WIND_GLSL}
${GRASS_COLOR_GLSL}
`,
        )
        .replace(
          '#include <beginnormal_vertex>',
          /* glsl */ `
  // ---- place this blade on the world lattice around the panda ----
  float id = float(gl_InstanceID);
  vec2 cellId = vec2(mod(id, uSide), floor(id / uSide));
  vec2 local = (cellId + hash22(cellId * 1.618 + 11.0)) / uSide * uPatch - uPatch * 0.5;
  vec2 centre = uPlayerPos.xz;
  vec2 worldXZ = local + uPatch * floor((centre - local) / uPatch + 0.5);

  float rnd = hash12(worldXZ * 3.17 + 5.3);
  float rnd2 = hash12(worldXZ * 7.31 - 1.7);
  float ground = terrainHeightAt(worldXZ);
  vec4 mask = terrainMaskAt(worldXZ);

  // Density: none on paths, paving, under buildings or in water.
  float density = 1.0 - smoothstep(0.25, 0.6, max(max(mask.r, mask.g), mask.a));
  density *= smoothstep(0.12, 0.45, ground);
  float meadow = fbm(worldXZ * 0.06);
  density *= 0.55 + 0.6 * smoothstep(0.2, 0.6, meadow);

  // Fade out towards the edge of the patch so it never pops.
  float edge = length(worldXZ - centre) / (uPatch * 0.5);
  float fade = 1.0 - smoothstep(0.55, 1.0, edge);

  float height = mix(0.26, 0.66, rnd) * (0.7 + 0.6 * meadow) * fade;
  if (rnd2 > density) height = 0.0;
  float width = mix(0.045, 0.085, rnd2) * (height > 0.0 ? 1.0 : 0.0);

  float t = position.y;
  float yaw = rnd * 6.2831;
  vec2 facing = vec2(cos(yaw), sin(yaw));
  vec2 sideDir = vec2(-facing.y, facing.x);

  // Bend: natural curve + wind + panda + shock-wave.
  float bendProfile = t * t;
  vec2 bend = facing * (0.12 + 0.18 * rnd2) * height;
  bend += windSway(worldXZ, rnd * 6.0) * 0.22 * height;
  vec2 away = worldXZ - uPlayerPos.xz;
  float dPlayer = length(away);
  float push = (1.0 - smoothstep(0.25, 1.35, dPlayer)) * step(uPlayerPos.y - 0.6, ground);
  bend += normalize(away + vec2(1e-4)) * push * 0.55;
  float shockR = uShockAge * 9.0;
  vec2 fromShock = worldXZ - uShockwave.xz;
  float dShock = length(fromShock);
  float ring = exp(-pow((dShock - shockR) * 1.3, 2.0)) * exp(-uShockAge * 1.6) * step(dShock, 7.0);
  bend += normalize(fromShock + vec2(1e-4)) * ring * 0.9;
  float squash = 1.0 - clamp(push * 0.35 + ring * 0.5, 0.0, 0.7);

  float profile = (1.0 - pow(t, 1.4)) * width * (0.35 + 0.65 * (1.0 - t * 0.2));
  vec3 bladePos;
  bladePos.xz = worldXZ + sideDir * position.x * profile + bend * bendProfile;
  bladePos.y = ground + t * height * squash - length(bend) * bendProfile * 0.35;

  // Colour: match the ground at the root, sunlit and varied at the tip.
  vec3 groundCol = grassGroundColor(worldXZ);
  vec3 tipCol = mix(uTip, groundCol * 1.35, 0.35 + 0.4 * rnd2);
  tipCol = mix(tipCol, vec3(0.78, 0.72, 0.38), step(0.93, rnd) * 0.6);
  vGrassColor = mix(groundCol * 0.55, tipCol, smoothstep(0.0, 1.0, t));
  vGrassTrans = t * t;

  vec3 objectNormal = vec3(0.0, 1.0, 0.0);
  #ifdef USE_TANGENT
    vec3 objectTangent = vec3(1.0, 0.0, 0.0);
  #endif
`,
        )
        .replace('#include <begin_vertex>', 'vec3 transformed = bladePos;');

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
uniform vec3 uSunColor;
uniform vec3 uSunDir;
varying vec3 vGrassColor;
varying float vGrassTrans;`,
        )
        .replace('#include <color_fragment>', 'diffuseColor.rgb = vGrassColor;')
        .replace(
          '#include <normal_fragment_begin>',
          /* glsl */ `
float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
vec3 normal = normalize(vNormal);
vec3 nonPerturbedNormal = normal;`,
        )
        .replace(
          '#include <opaque_fragment>',
          /* glsl */ `
  // Backlit blades glow when looking towards the sun.
  vec3 viewDirW = normalize(vViewPosition);
  {
    vec3 camToFrag = -(inverseTransformDirection(viewDirW, viewMatrix));
    float back = pow(max(dot(camToFrag, uSunDir), 0.0), 3.0);
    outgoingLight += uSunColor * vGrassColor * back * vGrassTrans * 1.6;
  }
  #include <opaque_fragment>`,
        );
    };
    material.customProgramCacheKey = () => 'grass-v1';
    this.mesh = new Mesh(geometry, material);
    this.mesh.name = 'grass';
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.applyQuality(settings);
  }

  addTo(scene: Scene): void {
    scene.add(this.mesh);
  }

  applyQuality(settings: QualitySettings): void {
    const side = Math.floor(Math.sqrt(settings.grassBlades));
    this.uniforms.uSide.value = side;
    this.uniforms.uPatch.value = settings.grassPatch;
    this.mesh.geometry.instanceCount = side * side;
  }
}
