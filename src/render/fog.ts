import { ShaderChunk } from 'three';
import { ATMOSPHERE, SUN_DIRECTION } from './atmosphere';

const f = (n: number) => n.toFixed(5);
const v3 = (c: { r: number; g: number; b: number }) => `vec3(${f(c.r)}, ${f(c.g)}, ${f(c.b)})`;

/**
 * GLSL for the colour of the haze seen along a view direction: cool lavender away from
 * the sun, warm peach towards it, with a glow around the sun itself. Shared by the fog and
 * the sky so the horizon always matches. `coolExpr` is the GLSL expression for the cool tint.
 */
export function hazeGLSL(coolExpr: string): string {
  const s = SUN_DIRECTION;
  return /* glsl */ `
  vec3 hazeColor(vec3 dir) {
    vec3 sunDir = vec3(${f(s.x)}, ${f(s.y)}, ${f(s.z)});
    vec2 d2 = normalize(dir.xz + vec2(1e-5));
    vec2 s2 = normalize(sunDir.xz);
    float w = pow(0.5 + 0.5 * dot(d2, s2), 2.4);
    vec3 col = mix(${coolExpr}, ${v3(ATMOSPHERE.fogWarmColor)}, w);
    float sunAmt = pow(max(dot(dir, sunDir), 0.0), 6.0);
    return mix(col, ${v3(ATMOSPHERE.fogSunColor)}, sunAmt * 0.55);
  }`;
}

/**
 * Replaces three.js' built-in fog with an aerial-perspective fog:
 *  - exponential distance fog that starts after `fogNear`,
 *  - height fog that pools in the valley and thins out over the peaks (shan shui mist),
 *  - direction-dependent colour (cool away from the sun, warm towards it).
 *
 * Applies to every built-in material automatically. Custom ShaderMaterials opt in by
 * including the fog chunks and setting `fog: true`.
 * Must run before the first material is compiled.
 */
export function installAtmosphericFog(): void {
  ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogWorldPos;
#endif`;

  ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogWorldPos = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
#endif`;

  ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying vec3 vFogWorldPos;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  ${hazeGLSL('fogColor')}
  vec3 applyAtmosphere(vec3 color, vec3 worldPos) {
    vec3 ray = worldPos - cameraPosition;
    float dist = length(ray);
    vec3 dir = ray / max(dist, 1e-4);
    #ifdef FOG_EXP2
      float t = 1.0 - exp(-fogDensity * dist);
    #else
      float t = clamp((dist - fogNear) / (fogFar - fogNear), 0.0, 1.0);
    #endif
    float distAmt = 1.0 - exp(-t * 3.2);
    float heightAmt = exp(-max(worldPos.y - ${f(ATMOSPHERE.fogBase)}, 0.0) * ${f(ATMOSPHERE.fogFalloff)});
    float amount = distAmt * mix(${f(ATMOSPHERE.fogHeightMin)}, 1.0, heightAmt);
    amount = max(amount, smoothstep(0.62, 1.0, t));
    return mix(color, hazeColor(dir), amount);
  }
#endif`;

  ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  gl_FragColor.rgb = applyAtmosphere(gl_FragColor.rgb, vFogWorldPos);
#endif`;
}
