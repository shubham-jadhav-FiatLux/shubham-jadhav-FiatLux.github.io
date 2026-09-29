import { Color } from 'three';

/**
 * Shared colours for ground cover so the terrain under the grass and the blades
 * themselves always agree.
 */
export const GRASS_COLORS = {
  uGrassA: new Color('#5a7f2e'),
  uGrassB: new Color('#8aa640'),
  uGrassDry: new Color('#b7a95a'),
  uGrassTip: new Color('#c9d46a'),
};

/** GLSL: grass colour at a ground position (needs NOISE_GLSL and the uniforms above). */
export const GRASS_COLOR_GLSL = /* glsl */ `
uniform vec3 uGrassA;
uniform vec3 uGrassB;
uniform vec3 uGrassDry;
vec3 grassGroundColor(vec2 xz) {
  float nLarge = fbm(xz * 0.045);
  vec3 grass = mix(uGrassA, uGrassB, smoothstep(0.3, 0.72, nLarge));
  grass = mix(grass, uGrassDry, smoothstep(0.58, 0.78, fbm(xz * 0.021 + 4.0)) * 0.55);
  return grass;
}
`;
