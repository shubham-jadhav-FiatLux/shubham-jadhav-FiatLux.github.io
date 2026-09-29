import { DirectionalLight, HemisphereLight, Matrix4, Vector3, type Scene } from 'three';
import { ATMOSPHERE, SUN_DIRECTION } from '../render/atmosphere';
import type { QualitySettings } from '../core/Quality';

const SHADOW_EXTENT = 32;
const lightSpace = new Matrix4();
const lightSpaceInv = new Matrix4();
const tmp = new Vector3();

/**
 * Golden-hour key light (with a shadow map that follows the panda) and a sky/ground
 * hemisphere fill. The shadow frustum snaps to texels to avoid shimmering.
 */
export class Lighting {
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  private texel = 1;

  constructor(scene: Scene, settings: QualitySettings) {
    this.hemi = new HemisphereLight(
      ATMOSPHERE.hemiSky,
      ATMOSPHERE.hemiGround,
      ATMOSPHERE.hemiIntensity,
    );
    scene.add(this.hemi);

    this.sun = new DirectionalLight(ATMOSPHERE.sunColor, ATMOSPHERE.sunIntensity);
    this.sun.castShadow = true;
    const cam = this.sun.shadow.camera;
    cam.left = -SHADOW_EXTENT;
    cam.right = SHADOW_EXTENT;
    cam.top = SHADOW_EXTENT;
    cam.bottom = -SHADOW_EXTENT;
    cam.near = 1;
    cam.far = 240;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 3;
    scene.add(this.sun, this.sun.target);

    // Light-space basis for texel snapping.
    lightSpace.lookAt(new Vector3(), SUN_DIRECTION.clone().negate(), new Vector3(0, 1, 0));
    lightSpaceInv.copy(lightSpace).invert();
    this.applyQuality(settings);
  }

  applyQuality(settings: QualitySettings): void {
    this.sun.castShadow = settings.shadows;
    if (this.sun.shadow.mapSize.x !== settings.shadowMapSize) {
      this.sun.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.texel = (SHADOW_EXTENT * 2) / settings.shadowMapSize;
  }

  /** Centres the shadow frustum on the point of interest. */
  update(focus: Vector3): void {
    tmp.copy(focus).applyMatrix4(lightSpaceInv);
    tmp.x = Math.round(tmp.x / this.texel) * this.texel;
    tmp.y = Math.round(tmp.y / this.texel) * this.texel;
    tmp.applyMatrix4(lightSpace);
    this.sun.target.position.copy(tmp);
    this.sun.position.copy(tmp).addScaledVector(SUN_DIRECTION, 120);
    this.sun.target.updateMatrixWorld();
  }
}
