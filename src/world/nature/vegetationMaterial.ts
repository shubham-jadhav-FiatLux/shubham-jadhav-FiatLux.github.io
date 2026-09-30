import { Color, DoubleSide, MeshStandardMaterial, type Texture } from 'three';
import { globalUniforms } from '../../render/uniforms';
import { WIND_GLSL } from '../../render/glsl';
import { ATMOSPHERE } from '../../render/atmosphere';

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
}

/**
 * MeshStandardMaterial with GPU wind: plants sway (more towards the top, using the
 * `aWind.x` height factor), leaves flutter (`aWind.y`), everything leans away from the
 * panda, and thin foliage glows when backlit by the low sun. Works with InstancedMesh.
 */
export function createVegetationMaterial(o: VegetationOptions): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({
    map: o.map ?? null,
    alphaTest: o.alphaTest ?? 0,
    roughness: o.roughness ?? 0.85,
    metalness: 0,
    vertexColors: true,
  });
  if (o.doubleSided !== false) mat.side = DoubleSide;
  const uniforms = {
    uSway: { value: o.sway ?? 0.3 },
    uFlutter: { value: o.flutter ?? 0 },
    uPush: { value: o.push ?? 0 },
    uPushRadius: { value: o.pushRadius ?? 1.6 },
    uTranslucency: { value: o.translucency ?? 0 },
    uSunColor: { value: new Color().copy(ATMOSPHERE.sunColor) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, {
      uTime: globalUniforms.uTime,
      uWindDir: globalUniforms.uWindDir,
      uWindStrength: globalUniforms.uWindStrength,
      uPlayerPos: globalUniforms.uPlayerPos,
      uSunDir: globalUniforms.uSunDir,
    });
    shader.vertexShader = shader.vertexShader
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
${WIND_GLSL}`,
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
    shader.fragmentShader = shader.fragmentShader
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
    if (o.keepNormals) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        /* glsl */ `
float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
vec3 normal = normalize(vNormal);
vec3 nonPerturbedNormal = normal;`,
      );
    }
  };
  mat.customProgramCacheKey = () => `veg-${o.keepNormals ? 1 : 0}`;
  mat.name = o.name;
  return mat;
}
