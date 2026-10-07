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
import { sj_GRASS_COLORS, sj_GRASS_COLOR_GLSL } from '../palette';
import { sj_ATMOSPHERE } from '../../render/atmosphere';
import type { QualitySettings } from '../../core/Quality';

const sj_SEGMENTS = 4;

function createBladeGeometry(): InstancedBufferGeometry {
  // position.x = side (-1..1), position.y = t along the blade (0..1)
  const sj_verts: number[] = [];
  for (let sj_i = 0; sj_i < sj_SEGMENTS; sj_i++) {
    const sj_t = sj_i / sj_SEGMENTS;
    sj_verts.push(-1, sj_t, 0, 1, sj_t, 0);
  }
  sj_verts.push(0, 1, 0);
  const sj_index: number[] = [];
  for (let sj_i = 0; sj_i < sj_SEGMENTS - 1; sj_i++) {
    const sj_a = sj_i * 2;
    sj_index.push(sj_a, sj_a + 1, sj_a + 2, sj_a + 1, sj_a + 3, sj_a + 2);
  }
  const sj_last = (sj_SEGMENTS - 1) * 2;
  sj_index.push(sj_last, sj_last + 1, sj_SEGMENTS * 2);
  const sj_geo = new InstancedBufferGeometry();
  sj_geo.setAttribute('position', new BufferAttribute(new Float32Array(sj_verts), 3));
  // Lighting uses an up-facing normal so blades shade like the ground beneath them.
  const sj_normals = new Float32Array(sj_verts.length);
  for (let sj_i = 1; sj_i < sj_normals.length; sj_i += 3) sj_normals[sj_i] = 1;
  sj_geo.setAttribute('normal', new BufferAttribute(sj_normals, 3));
  sj_geo.setIndex(sj_index);
  return sj_geo;
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

  constructor(sj_settings: QualitySettings) {
    const sj_geometry = createBladeGeometry();
    const sj_material = new MeshLambertMaterial({ side: DoubleSide });
    const sj_tipColor = sj_GRASS_COLORS.uGrassTip;
    const sj_sunColor = new Color().copy(sj_ATMOSPHERE.sunColor);
    sj_material.onBeforeCompile = (sj_shader) => {
      for (const [sj_k, sj_v] of Object.entries(sj_GRASS_COLORS))
        sj_shader.uniforms[sj_k] = { value: sj_v };
      Object.assign(sj_shader.uniforms, this.uniforms, {
        uTime: sj_globalUniforms.uTime,
        uWindDir: sj_globalUniforms.uWindDir,
        uWindStrength: sj_globalUniforms.uWindStrength,
        uPlayerPos: sj_globalUniforms.uPlayerPos,
        uShockwave: sj_globalUniforms.uShockwave,
        uShockAge: sj_globalUniforms.uShockAge,
        uRipple: sj_globalUniforms.uRipple,
        uHeightMap: sj_globalUniforms.uHeightMap,
        uMaskMap: sj_globalUniforms.uMaskMap,
        uDetailMap: sj_globalUniforms.uDetailMap,
        uTerrain: sj_globalUniforms.uTerrain,
        uTip: { value: sj_tipColor },
        uSunColor: { value: sj_sunColor },
        uSunDir: sj_globalUniforms.uSunDir,
        uLampLight: { value: sj_ATMOSPHERE.lampLight },
      });
      sj_shader.vertexShader = sj_shader.vertexShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
uniform float uPatch;
uniform float uSide;
uniform vec3 uPlayerPos;
uniform vec3 uShockwave;
uniform float uShockAge;
uniform vec4 uRipple;
uniform vec3 uTip;
uniform vec3 uSunDir;
varying vec3 vGrassColor;
varying float vGrassTrans;
varying float vGrassLamp;
${sj_NOISE_GLSL}
${sj_GROUND_WARP_GLSL}
${sj_TERRAIN_GLSL}
${sj_WIND_GLSL}
${sj_GRASS_COLOR_GLSL}
${sj_VIEW_CULL_GLSL}
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
  float ground = terrainHeightAt(worldXZ);

  // Many blades never show: the patch is square but the grass fades out in a circle,
  // much of it lies behind or beside the camera, and paths and paving leave gaps. Such a
  // blade is folded into a single point (no triangles to draw) as early as possible,
  // before the costly part. (The sphere allows for the tallest blade, bent the furthest.)
  vec3 bladePos = vec3(worldXZ.x, ground - 50.0, worldXZ.y);
  vGrassColor = vec3(0.0);
  vGrassTrans = 0.0;
  vGrassLamp = 0.0;
  float edge = length(worldXZ - centre) / (uPatch * 0.5);
  vec3 viewCentre = (viewMatrix * vec4(worldXZ.x, ground + 0.45, worldXZ.y, 1.0)).xyz;
  if (edge < 1.0 && sphereInView(viewCentre, 1.6)) {
    float rnd = hash12(worldXZ * 3.17 + 5.3);
    float rnd2 = hash12(worldXZ * 7.31 - 1.7);
    vec4 mask = terrainMaskAt(worldXZ);

    // Density: none on paths, paving, gravel, steep ground, under buildings or in water.
    // Ragged, noisy edges; blades get shorter and sparser towards them.
    vec4 detail = terrainDetailAt(worldXZ);
    vGrassLamp = detail.r;
    float pathW = terrainMaskAt(worldXZ + groundWarp(worldXZ)).r;
    float bare = max(max(max(pathW, mask.g), mask.a), detail.a);
    // ragged edges: broad bays plus small tufts poking out onto paths and paving
    bare += (vnoise(worldXZ * 1.9) - 0.5) * 0.22 + (vnoise(worldXZ * 5.3) - 0.5) * 0.16;
    float density = 1.0 - smoothstep(0.25, 0.6, bare);
    density *= smoothstep(0.12, 0.45, ground + (vnoise(worldXZ * 0.8) - 0.5) * 0.25);
    float meadow = fbm(worldXZ * 0.06);
    density *= 0.55 + 0.6 * smoothstep(0.2, 0.6, meadow);
    if (rnd2 <= density) {
      // Fade out towards the edge of the patch so it never pops.
      float fade = 1.0 - smoothstep(0.55, 1.0, edge);

      float height = mix(0.26, 0.66, rnd) * (0.7 + 0.6 * meadow) * fade;
      height *= 1.0 - 0.62 * smoothstep(0.02, 0.5, bare);
      // thinner, shorter, drier grass running down onto the beach
      float beach = 1.0 - smoothstep(0.3, 0.95, ground + (vnoise(worldXZ * 1.3) - 0.5) * 0.3);
      height *= 1.0 - 0.5 * beach;
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
      bladePos.xz = worldXZ + sideDir * position.x * profile + bend * bendProfile;
      bladePos.y = ground + t * height * squash - length(bend) * bendProfile * 0.35;

      // Colour: match the ground at the root, sunlit and varied at the tip.
      vec3 groundCol = grassGroundColor(worldXZ);
      vec3 tipCol = mix(uTip, groundCol * 1.35, 0.35 + 0.4 * rnd2);
      tipCol = mix(tipCol, vec3(0.78, 0.72, 0.38), step(0.93, rnd) * 0.6);
      // trampled, sun-dried tips along paths and yards
      tipCol = mix(tipCol, uGrassDry * 1.15, max(smoothstep(0.08, 0.45, pathW), beach) * 0.45);
      vGrassColor = mix(groundCol * 0.55, tipCol, smoothstep(0.0, 1.0, t));
      vGrassTrans = t * t;
      {
        // discovery ripple: blades light up gold as the ring passes
        float age = uRipple.z;
        float rr = length(worldXZ - uRipple.xy);
        float glow = age < 3.0 ? exp(-pow((rr - age * 7.5) * 1.2, 2.0)) * exp(-age * 1.1) * uRipple.w : 0.0;
        vGrassColor += vec3(1.2, 0.85, 0.3) * glow * t;
      }
    }
  }

  vec3 objectNormal = vec3(0.0, 1.0, 0.0);
  #ifdef USE_TANGENT
    vec3 objectTangent = vec3(1.0, 0.0, 0.0);
  #endif
`,
        )
        .replace('#include <begin_vertex>', 'vec3 transformed = bladePos;');

      sj_shader.fragmentShader = sj_shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uLampLight;
varying vec3 vGrassColor;
varying float vGrassTrans;
varying float vGrassLamp;`,
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
    // warm lantern light on the blades around each lantern
    outgoingLight += uLampLight * vGrassLamp * (0.35 + 0.65 * vGrassTrans);
  }
  #include <opaque_fragment>`,
        );
    };
    sj_material.customProgramCacheKey = () => 'grass-v5';
    this.mesh = new Mesh(sj_geometry, sj_material);
    this.mesh.name = 'grass';
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.applyQuality(sj_settings);
  }

  addTo(sj_scene: Scene): void {
    sj_scene.add(this.mesh);
  }

  applyQuality(sj_settings: QualitySettings): void {
    const sj_side = Math.floor(Math.sqrt(sj_settings.grassBlades));
    this.uniforms.uSide.value = sj_side;
    this.uniforms.uPatch.value = sj_settings.grassPatch;
    this.mesh.geometry.instanceCount = sj_side * sj_side;
  }
}
