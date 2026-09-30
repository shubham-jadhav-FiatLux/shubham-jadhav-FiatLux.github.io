import { Color, Vector3 } from 'three';

/**
 * Golden-hour lighting palette. Sky, fog, sun and water all read from here so the
 * horizon, haze and highlights always agree.
 */
export const SUN_DIRECTION = new Vector3(-0.74, 0.36, 0.48).normalize();

export const ATMOSPHERE = {
  sunColor: new Color('#ffd6a0'),
  sunIntensity: 3.1,
  skyZenith: new Color('#79a9d6'),
  skyMid: new Color('#b9d3e6'),
  skyHorizon: new Color('#f5d5ab'),
  skyHorizonCool: new Color('#c9d3e0'),
  sunGlow: new Color('#ffc27a'),
  hemiSky: new Color('#cfe0f0'),
  hemiGround: new Color('#7d8a52'),
  hemiIntensity: 1.25,
  /** haze looking away from the sun (cool, lavender blue) */
  fogColor: new Color('#b9c3d3'),
  /** haze looking towards the sun (warm peach) */
  fogWarmColor: new Color('#f1d0a3'),
  /** extra glow right around the sun */
  fogSunColor: new Color('#ffd08a'),
  fogNear: 36,
  fogFar: 900,
  /** metres: fog is densest below this height */
  fogBase: 2,
  /** 1/metres: how quickly height fog thins out */
  fogFalloff: 0.018,
  /** fraction of distance fog kept high above the valley */
  fogHeightMin: 0.42,
  /** warm light the lanterns cast on ground, grass and water (emissive, HDR) */
  lampLight: new Color('#ff9a45').multiplyScalar(0.55),
} as const;
