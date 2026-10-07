import { Color, DoubleSide, MeshStandardMaterial, type Texture } from 'three';
import { sj_globalUniforms } from '../../render/uniforms';
import { sj_WIND_GLSL } from '../../render/glsl';
import { sj_ATMOSPHERE } from '../../render/atmosphere';

export interface VegetationOptions {
  name: string;
  map?: Texture;
  alphaTest?: number;
  roughness?: number;
  /** whole-plant sway amplitude (m at the top) */
  sway?: number;
  /** leaf flutter amplitude (m) */
  flutter?: number;
  /** keep authored normals on back faces (spherical canopy normals) */
  keepNormals?: boolean;
  /** backlit glow strength */
  translucency?: number;
  /** how far the plant leans away from the panda */
  push?: number;
  pushRadius?: number;
  doubleSided?: boolean;
  /**
   * Bamboo culm shading (needs the `aCulm` attribute): dark node rings, a waxy bloom just
   * below each node and, where `aCulm.w` = 1, a stripe in the groove of each internode.
   */
  culm?: { node: Color; bloom: Color; stripe: Color };
}

/**
 * MeshStandardMaterial with GPU wind: plants sway (more towards the top, using the
 * `aWind.x` height factor), leaves flutter (`aWind.y`), everything leans away from the
 * panda, and thin foliage glows when backlit by the low sun. Works with InstancedMesh.
 */
export function createVegetationMaterial(sj_o: VegetationOptions): MeshStandardMaterial {
  const sj_mat = new MeshStandardMaterial({
    map: sj_o.map ?? null,
    alphaTest: sj_o.alphaTest ?? 0,
    roughness: sj_o.roughness ?? 0.85,
    metalness: 0,
    vertexColors: true,
  });
  if (sj_o.doubleSided !== false) sj_mat.side = DoubleSide;
  const sj_uniforms = {
    uSway: { value: sj_o.sway ?? 0.3 },
    uFlutter: { value: sj_o.flutter ?? 0 },
    uPush: { value: sj_o.push ?? 0 },
    uPushRadius: { value: sj_o.pushRadius ?? 1.6 },
    uTranslucency: { value: sj_o.translucency ?? 0 },
    uSunColor: { value: new Color().copy(sj_ATMOSPHERE.sunColor) },
    uCulmNode: { value: sj_o.culm?.node ?? new Color() },
    uCulmBloom: { value: sj_o.culm?.bloom ?? new Color() },
    uCulmStripe: { value: sj_o.culm?.stripe ?? new Color() },
  };
  sj_mat.onBeforeCompile = (sj_shader) => {
    Object.assign(sj_shader.uniforms, sj_uniforms, {
      uTime: sj_globalUniforms.uTime,
      uWindDir: sj_globalUniforms.uWindDir,
      uWindStrength: sj_globalUniforms.uWindStrength,
      uPlayerPos: sj_globalUniforms.uPlayerPos,
      uSunDir: sj_globalUniforms.uSunDir,
    });
    if (sj_o.culm) {
      sj_shader.vertexShader = sj_shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute vec4 aCulm;\nvarying vec4 vCulm;',
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCulm = aCulm;');
      sj_shader.fragmentShader = sj_shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec4 vCulm;\nuniform vec3 uCulmNode;\nuniform vec3 uCulmBloom;\nuniform vec3 uCulmStripe;',
        )
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
{
  float k = fract(vCulm.x);
  float n = floor(vCulm.x);
  float fw = fwidth(vCulm.x) * 1.5 + 1e-4;
  // node ring right at each node, a paler waxy band just below it
  float ring = 1.0 - smoothstep(0.03, 0.03 + fw, min(k, 1.0 - k));
  float bloom = smoothstep(0.8 - fw, 0.86, k) * (1.0 - smoothstep(0.955, 0.965 + fw, k));
  vec2 dir = vCulm.yz;
  float gAng = mod(n, 2.0) * 3.14159 + 0.3;
  float stripe = vCulm.w * step(0.5, length(dir))
    * smoothstep(0.62, 0.8, dot(normalize(dir + 1e-5), vec2(cos(gAng), sin(gAng))));
  diffuseColor.rgb = mix(diffuseColor.rgb, uCulmStripe, stripe * 0.85);
  diffuseColor.rgb = mix(diffuseColor.rgb, uCulmBloom, bloom * 0.55);
  diffuseColor.rgb = mix(diffuseColor.rgb, uCulmNode, ring * 0.85);
}`,
        );
    }
    sj_shader.vertexShader = sj_shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
attribute vec2 aWind;
varying vec3 vVegWorld;
uniform float uSway;
uniform float uFlutter;
uniform float uPush;
uniform float uPushRadius;
uniform vec3 uPlayerPos;
${sj_WIND_GLSL}`,
      )
      .replace(
        '#include <project_vertex>',
        /* glsl */ `#include <project_vertex>
  #ifdef USE_INSTANCING
    vVegWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vVegWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
{
  #ifdef USE_INSTANCING
    vec3 instPos = instanceMatrix[3].xyz;
    mat3 im = mat3(instanceMatrix);
  #else
    vec3 instPos = vec3(0.0);
    mat3 im = mat3(1.0);
  #endif
  vec3 worldBase = (modelMatrix * vec4(instPos, 1.0)).xyz;
  float h = aWind.x;
  float phase = dot(worldBase.xz, vec2(0.37, 0.61));
  vec2 sway = windSway(worldBase.xz, phase) * uSway * h * h;
  vec2 away = worldBase.xz - uPlayerPos.xz;
  float d = length(away);
  sway += normalize(away + vec2(1e-4)) * (1.0 - smoothstep(0.3, uPushRadius, d)) * uPush * h;
  vec3 worldOff = vec3(sway.x, -dot(sway, sway) * 0.15, sway.y);
  float fl = aWind.y * uFlutter;
  worldOff += fl * vec3(
    sin(uTime * 6.3 + position.x * 2.7 + phase),
    0.6 * sin(uTime * 8.1 + position.z * 3.1),
    cos(uTime * 5.7 + position.y * 2.3 + phase));
  float s2 = max(dot(im[0], im[0]), 1e-4);
  transformed += transpose(im) * worldOff / s2;
}`,
      );
    sj_shader.fragmentShader = sj_shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
uniform float uTranslucency;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uPlayerPos;
varying vec3 vVegWorld;
// 4x4 Bayer matrix for screen-door transparency.
float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float i = q.x + q.y * 4.0;
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[int(i)] + 0.5) / 16.0;
}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        /* glsl */ `#include <clipping_planes_fragment>
  {
    // Dissolve foliage that stands between the camera and the panda.
    vec3 toPlayer = uPlayerPos + vec3(0.0, 0.8, 0.0) - cameraPosition;
    float lenP = length(toPlayer);
    vec3 dirP = toPlayer / max(lenP, 1e-3);
    vec3 rel = vVegWorld - cameraPosition;
    float along = dot(rel, dirP);
    if (along > 0.0 && along < lenP - 0.7) {
      float perp = length(rel - dirP * along);
      float keep = smoothstep(1.0, 2.6, perp);
      if (keep < bayer4(gl_FragCoord.xy)) discard;
    }
  }`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
  {
    vec3 camToFrag = -inverseTransformDirection(normalize(vViewPosition), viewMatrix);
    float back = pow(max(dot(camToFrag, uSunDir), 0.0), 4.0);
    outgoingLight += diffuseColor.rgb * uSunColor * back * uTranslucency;
  }
  #include <opaque_fragment>`,
      );
    if (sj_o.keepNormals) {
      sj_shader.fragmentShader = sj_shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        /* glsl */ `
float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
vec3 normal = normalize(vNormal);
vec3 nonPerturbedNormal = normal;`,
      );
    }
  };
  sj_mat.customProgramCacheKey = () => `veg-${sj_o.keepNormals ? 1 : 0}-${sj_o.culm ? 1 : 0}`;
  sj_mat.name = sj_o.name;
  return sj_mat;
}
