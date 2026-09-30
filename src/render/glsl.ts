/**
 * Reusable GLSL snippets. Kept as TypeScript strings so they can be composed into
 * `onBeforeCompile` injections as well as full ShaderMaterials.
 */

/** Hash-based value noise and fbm (hashes by Dave Hoskins, no sin() precision issues). */
export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s;
}
`;

/** Terrain lookups shared by grass, water and anything that needs ground height on GPU. */
export const TERRAIN_GLSL = /* glsl */ `
uniform sampler2D uHeightMap;
uniform sampler2D uMaskMap;
uniform vec3 uTerrain; // origin, size, resolution
vec2 terrainGridUV(vec2 xz) {
  float cell = uTerrain.y / (uTerrain.z - 1.0);
  return ((xz - uTerrain.x) / cell + 0.5) / uTerrain.z;
}
float terrainHeightAt(vec2 xz) {
  return texture2D(uHeightMap, terrainGridUV(xz)).r;
}
vec4 terrainMaskAt(vec2 xz) {
  return texture2D(uMaskMap, (xz - uTerrain.x) / uTerrain.y);
}
`;

/** Wind sway used by grass, bamboo, trees and banners so everything moves together. */
export const WIND_GLSL = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
// Returns a horizontal displacement for a point at world xz; 'stiffness' 0..1.
vec2 windSway(vec2 xz, float phase) {
  float t = uTime;
  float gust = 0.55 + 0.45 * sin(t * 0.35 + dot(xz, uWindDir) * 0.045);
  float wave = sin(t * 1.9 + dot(xz, uWindDir) * 0.35 + phase) * 0.6
             + sin(t * 3.1 + xz.x * 0.21 + xz.y * 0.17 + phase * 1.7) * 0.25;
  return uWindDir * (wave + 0.9) * gust * uWindStrength;
}
`;

/** 3D value noise (object-space detail on rocks and other solids). */
export const NOISE3_GLSL = /* glsl */ `
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
}
float fbm3(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise3(p);
    p = p * 2.07 + vec3(13.1, 7.7, 3.3);
    a *= 0.5;
  }
  return s / 0.875;
}
`;

/**
 * Bump mapping from any scalar height evaluated per pixel (screen-space derivatives,
 * after Mikkelsen). `surfPos` and `surfNorm` in view space; returns the perturbed normal.
 */
export const BUMP_GLSL = /* glsl */ `
vec3 bumpFromHeight(vec3 surfPos, vec3 surfNorm, float h) {
  vec3 dpdx = dFdx(surfPos);
  vec3 dpdy = dFdy(surfPos);
  vec3 r1 = cross(dpdy, surfNorm);
  vec3 r2 = cross(surfNorm, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;
