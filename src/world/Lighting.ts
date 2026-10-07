import { DirectionalLight, HemisphereLight, Matrix4, Vector3, type Scene } from 'three';
import { sj_ATMOSPHERE, sj_SUN_DIRECTION } from '../render/atmosphere';
import type { QualitySettings } from '../core/Quality';

const sj_SHADOW_EXTENT = 32;
/** half the width of a shadow frustum that takes in every caster in the valley */
const sj_VALLEY_EXTENT = 150;
const sj_lightSpace = new Matrix4();
const sj_lightSpaceInv = new Matrix4();
const sj_tmp = new Vector3();

/**
 * Golden-hour key light (with a shadow map that follows the panda) and a sky/ground
 * hemisphere fill. The shadow frustum snaps to texels to avoid shimmering.
 */
export class Lighting {
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  private texel = 1;

  constructor(sj_scene: Scene, sj_settings: QualitySettings) {
    this.hemi = new HemisphereLight(
      sj_ATMOSPHERE.hemiSky,
      sj_ATMOSPHERE.hemiGround,
      sj_ATMOSPHERE.hemiIntensity,
    );
    sj_scene.add(this.hemi);

    this.sun = new DirectionalLight(sj_ATMOSPHERE.sunColor, sj_ATMOSPHERE.sunIntensity);
    this.sun.castShadow = true;
    const sj_cam = this.sun.shadow.camera;
    sj_cam.left = -sj_SHADOW_EXTENT;
    sj_cam.right = sj_SHADOW_EXTENT;
    sj_cam.top = sj_SHADOW_EXTENT;
    sj_cam.bottom = -sj_SHADOW_EXTENT;
    sj_cam.near = 1;
    sj_cam.far = 240;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 3;
    sj_scene.add(this.sun, this.sun.target);

    // Light-space basis for texel snapping.
    sj_lightSpace.lookAt(new Vector3(), sj_SUN_DIRECTION.clone().negate(), new Vector3(0, 1, 0));
    sj_lightSpaceInv.copy(sj_lightSpace).invert();
    this.applyQuality(sj_settings);
  }

  applyQuality(sj_settings: QualitySettings): void {
    this.sun.castShadow = sj_settings.shadows;
    if (this.sun.shadow.mapSize.x !== sj_settings.shadowMapSize) {
      this.sun.shadow.mapSize.set(sj_settings.shadowMapSize, sj_settings.shadowMapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.texel = (sj_SHADOW_EXTENT * 2) / sj_settings.shadowMapSize;
  }

  /**
   * Stretches the shadow frustum over the whole valley (`true`), or back to its usual
   * size round the point of interest. Used for one frame while loading, so that frame
   * draws every shadow caster and their shadow shaders are compiled before the visitor
   * sees anything (`compileAsync` only prepares the shaders of the visible materials).
   */
  coverValley(sj_on: boolean): void {
    const sj_cam = this.sun.shadow.camera;
    const sj_extent = sj_on ? sj_VALLEY_EXTENT : sj_SHADOW_EXTENT;
    sj_cam.left = -sj_extent;
    sj_cam.right = sj_extent;
    sj_cam.top = sj_extent;
    sj_cam.bottom = -sj_extent;
    sj_cam.far = sj_on ? 600 : 240;
    sj_cam.updateProjectionMatrix();
    if (sj_on) {
      this.sun.target.position.set(0, 0, 0);
      this.sun.position.copy(sj_SUN_DIRECTION).multiplyScalar(300);
      this.sun.target.updateMatrixWorld();
    }
  }

  /** Centres the shadow frustum on the point of interest. */
  update(sj_focus: Vector3): void {
    sj_tmp.copy(sj_focus).applyMatrix4(sj_lightSpaceInv);
    sj_tmp.x = Math.round(sj_tmp.x / this.texel) * this.texel;
    sj_tmp.y = Math.round(sj_tmp.y / this.texel) * this.texel;
    sj_tmp.applyMatrix4(sj_lightSpace);
    this.sun.target.position.copy(sj_tmp);
    this.sun.position.copy(sj_tmp).addScaledVector(sj_SUN_DIRECTION, 120);
    this.sun.target.updateMatrixWorld();
  }
}
