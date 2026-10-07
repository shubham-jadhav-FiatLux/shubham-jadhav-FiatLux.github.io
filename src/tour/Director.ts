import { Vector3 } from 'three';
import { easeInOutCubic } from '../utils/math';
import { sj_WATER_LEVEL } from '../world/layout';
import type { CameraRig } from '../camera/CameraRig';
import { createPose, panTilt, type Shot } from './shots';

const sj_fromDir = new Vector3();
const sj_toDir = new Vector3();
const sj_mid = new Vector3();

/**
 * Drives the camera during the tour: holds the current shot, cuts or blends between
 * shots, keeps the lens wide enough for portrait screens and the camera above ground
 * and water, and hands the pose to the camera rig every frame.
 */
export class Director {
  paused = false;
  /** blends become cuts (visitors who prefer less motion) */
  reducedMotion = false;
  private shot: Shot | null = null;
  private t = 0;
  private blend = 0;
  private blendT = 1;
  /** how high the blend path bows up between the two views (fraction of the distance) */
  private arc = 0;
  /** the lens of the last pose, before widening for tall screens */
  private lastFov = 0;
  private readonly from = createPose();
  private readonly pose = createPose();
  private readonly out = createPose();

  constructor(
    private readonly rig: CameraRig,
    private readonly ground: (sj_x: number, sj_z: number) => number,
  ) {}

  get active(): boolean {
    return this.shot !== null;
  }

  /** Seconds since the current shot started. */
  get shotTime(): number {
    return this.t;
  }

  /**
   * Switches to `shot`: instantly, or blending from the current view over `blend` s. A
   * blend glides along a curve (bowing up by `arc` × the distance travelled, if given)
   * and turns the view smoothly rather than sliding the point it looks at.
   */
  cut(sj_shot: Shot, sj_blend = 0, sj_o: { arc?: number } = {}): void {
    const sj_cam = this.rig.camera;
    this.from.position.copy(sj_cam.position);
    this.from.target.copy(this.rig.lookTarget);
    // blend from the shot's own lens, not the one already widened for a tall screen
    this.from.fov = this.shot && this.lastFov ? this.lastFov : unlens(sj_cam.fov, sj_cam.aspect);
    this.shot = sj_shot;
    this.t = 0;
    this.blend = this.reducedMotion ? 0 : sj_blend;
    this.blendT = this.blend > 0 ? 0 : 1;
    this.arc = sj_o.arc ?? 0;
  }

  /** Stops directing; the rig goes back to following the panda. */
  release(): void {
    this.shot = null;
  }

  update(sj_dt: number): void {
    const sj_shot = this.shot;
    if (!sj_shot) return;
    const sj_sdt = this.paused ? 0 : sj_dt;
    this.t += sj_sdt;
    this.pose.clearance = undefined;
    sj_shot.pose(this.t, sj_sdt, this.pose);
    const sj_p = this.out;
    if (this.blendT < 1) {
      this.blendT = Math.min(1, this.blendT + sj_sdt / this.blend);
      const sj_k = easeInOutCubic(this.blendT);
      const sj_a = this.from;
      const sj_b = this.pose;
      // position: a quadratic Bezier from the old view to the new one
      sj_mid.lerpVectors(sj_a.position, sj_b.position, 0.5);
      sj_mid.y += sj_a.position.distanceTo(sj_b.position) * this.arc;
      const sj_u = 1 - sj_k;
      sj_p.position
        .copy(sj_a.position)
        .multiplyScalar(sj_u * sj_u)
        .addScaledVector(sj_mid, 2 * sj_u * sj_k)
        .addScaledVector(sj_b.position, sj_k * sj_k);
      // view: turn from one direction to the other
      sj_fromDir.subVectors(sj_a.target, sj_a.position);
      sj_toDir.subVectors(sj_b.target, sj_b.position);
      const sj_da = sj_fromDir.length() || 1;
      const sj_db = sj_toDir.length() || 1;
      panTilt(sj_fromDir.multiplyScalar(1 / sj_da), sj_toDir.multiplyScalar(1 / sj_db), sj_k);
      sj_p.target.copy(sj_p.position).addScaledVector(sj_fromDir, sj_da + (sj_db - sj_da) * sj_k);
      sj_p.fov = sj_a.fov + (sj_b.fov - sj_a.fov) * sj_k;
    } else {
      sj_p.position.copy(this.pose.position);
      sj_p.target.copy(this.pose.target);
      sj_p.fov = this.pose.fov;
    }
    // Never underground or underwater.
    const sj_clearance = this.pose.clearance ?? 0.45;
    const sj_floor =
      Math.max(this.ground(sj_p.position.x, sj_p.position.z), sj_WATER_LEVEL) + sj_clearance;
    if (sj_p.position.y < sj_floor) sj_p.position.y = sj_floor;
    this.lastFov = sj_p.fov;
    this.rig.direct(sj_p.position, sj_p.target, lensFor(sj_p.fov, this.rig.camera.aspect));
  }
}

/**
 * Shots are framed for landscape screens; on tall screens the same vertical field of
 * view would crop the sides, so the lens widens to keep the subject and its setting.
 */
export function lensFor(sj_fov: number, sj_aspect: number): number {
  if (sj_aspect >= 1.3) return sj_fov;
  return Math.min(80, sj_fov * (1 + (1.3 - sj_aspect) * 0.65));
}

/** The lens a shot asked for, given the widened lens shown on a screen of `sj_aspect`. */
export function unlens(sj_fov: number, sj_aspect: number): number {
  if (sj_aspect >= 1.3) return sj_fov;
  return sj_fov / (1 + (1.3 - sj_aspect) * 0.65);
}
