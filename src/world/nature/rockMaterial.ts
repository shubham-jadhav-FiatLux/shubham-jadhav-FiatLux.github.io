import { MeshStandardMaterial } from 'three';
import { BUMP_GLSL, NOISE3_GLSL } from '../../render/glsl';
import { WATER_LEVEL } from '../layout';

export interface RockMaterialOptions {
  /** strength of the pixel-level bump (m) */
  bump?: number;
  /** amount of lichen on sunny faces */
  lichen?: number;
}

/**
 * Stone surface for rocks and cliffs, on top of the baked vertex colours:
 * mineral grain and speckles, fine cracks, lichen spots on the upward faces, a bumpy
 * normal from the same noise, and a darker, glossier band where the stone is wet.
 * Noise runs in object space scaled by the instance size, so big and small rocks share
 * the same grain size. Works with InstancedMesh (and instance colours).
 */
export function createRockMaterial(o: RockMaterialOptions = {}): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  mat.name = 'rock';
  const uniforms = {
    uRockBump: { value: o.bump ?? 0.022 },
    uLichen: { value: o.lichen ?? 1 },
    uWaterLevel: { value: WATER_LEVEL },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
varying vec3 vRockLocal;
varying vec3 vRockWorld;
varying float vRockUp;`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
{
  float rockScale = 1.0;
  vec4 rockWp = vec4(transformed, 1.0);
  vec3 rockN = objectNormal;
  #ifdef USE_INSTANCING
    rockScale = length(instanceMatrix[0].xyz);
    rockWp = instanceMatrix * rockWp;
    rockN = mat3(instanceMatrix) * rockN;
  #endif
  vRockLocal = transformed * rockScale;
  vRockWorld = (modelMatrix * rockWp).xyz;
  vRockUp = normalize(mat3(modelMatrix) * rockN).y;
}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
uniform float uRockBump;
uniform float uLichen;
uniform float uWaterLevel;
varying vec3 vRockLocal;
varying vec3 vRockWorld;
varying float vRockUp;
${NOISE3_GLSL}
${BUMP_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
vec3 rp = vRockLocal;
float rockMid = vnoise3(rp * 2.6 + 7.0);
float rockFine = vnoise3(rp * 9.0 + 3.0);
// hairline cracks: thin ridged-noise lines, only in some regions of the stone
float rockCrack = smoothstep(0.955, 0.995, 1.0 - abs(vnoise3(rp * 1.9 + 21.0) * 2.0 - 1.0))
  * smoothstep(0.5, 0.7, vnoise3(rp * 0.6 + 5.0));
float rockWet = 1.0 - smoothstep(0.08, 0.5, vRockWorld.y - uWaterLevel);
{
  float large = vnoise3(rp * 0.7);
  diffuseColor.rgb *= 0.84 + 0.2 * large + 0.1 * rockMid + 0.08 * rockFine;
  // mineral speckles
  float speck = smoothstep(0.82, 0.9, vnoise3(rp * 21.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.3 + 0.025, speck * 0.45);
  // lichen patches on sunny, upward faces
  float up = clamp(vRockUp, 0.0, 1.0);
  float lichen = smoothstep(0.68, 0.74, vnoise3(rp * 2.4 + 11.0)) * smoothstep(0.1, 0.6, up);
  lichen *= smoothstep(0.3, 0.6, rockFine + 0.2) * uLichen * (1.0 - rockWet);
  // lichen grows on bare stone, not on the moss
  lichen *= 1.0 - smoothstep(0.015, 0.08, diffuseColor.g - diffuseColor.r);
  // (linear colours: sage and ochre)
  vec3 lichenCol = mix(vec3(0.3, 0.35, 0.18), vec3(0.5, 0.31, 0.09), step(0.55, large));
  diffuseColor.rgb = mix(diffuseColor.rgb, lichenCol * (0.9 + 0.15 * rockFine), lichen * 0.45);
  // hairline cracks
  diffuseColor.rgb *= 1.0 - rockCrack * 0.38;
  // wet stone near the waterline: darker and a little green
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.5, 0.56, 0.52), rockWet);
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.32, rockWet);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
normal = bumpFromHeight(-vViewPosition, normal,
  (rockMid * 0.55 + rockFine * 0.3 - rockCrack * 0.5) * uRockBump);`,
      );
  };
  mat.customProgramCacheKey = () => 'rock-v2';
  return mat;
}
