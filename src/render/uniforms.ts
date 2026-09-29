import { Vector2, Vector3, type Texture } from 'three';
import { SUN_DIRECTION } from './atmosphere';
import { TERRAIN_ORIGIN, TERRAIN_RES, TERRAIN_SIZE } from '../world/layout';

/**
 * Uniforms shared by many materials. three.js uploads uniforms by reference, so every
 * material that includes one of these objects sees updates without extra work.
 */
export const globalUniforms = {
  uTime: { value: 0 },
  /** normalised wind direction on the ground plane */
  uWindDir: { value: new Vector2(0.8, -0.6).normalize() },
  uWindStrength: { value: 1 },
  /** world position of the panda (grass bends away from it) */
  uPlayerPos: { value: new Vector3() },
  /** expanding shock-wave from the kung-fu strike: xyz = centre, w = age in seconds */
  uShockwave: { value: new Vector3(0, -1000, 0) },
  uShockAge: { value: 99 },
  uSunDir: { value: SUN_DIRECTION.clone() },
  uHeightMap: { value: null as Texture | null },
  uMaskMap: { value: null as Texture | null },
  /** terrain mapping: x = origin, y = size, z = grid resolution */
  uTerrain: { value: new Vector3(TERRAIN_ORIGIN, TERRAIN_SIZE, TERRAIN_RES) },
};

export type GlobalUniforms = typeof globalUniforms;
