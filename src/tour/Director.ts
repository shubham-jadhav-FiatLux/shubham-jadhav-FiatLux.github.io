import { Vector3 } from 'three';
import { easeInOutCubic } from '../utils/math';
import { WATER_LEVEL } from '../world/layout';
import type { CameraRig } from '../camera/CameraRig';
import { createPose, panTilt, type Shot } from './shots';

const fromDir = new Vector3();
const toDir = new Vector3();
const mid = new Vector3();

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
    private readonly ground: (x: number, z: number) => number,
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
  cut(shot: Shot, blend = 0, o: { arc?: number } = {}): void {
    const cam = this.rig.camera;
    this.from.position.copy(cam.position);
    this.from.target.copy(this.rig.lookTarget);
    // blend from the shot's own lens, not the one already widened for a tall screen
    this.from.fov = this.shot && this.lastFov ? this.lastFov : unlens(cam.fov, cam.aspect);
    this.shot = shot;
    this.t = 0;
    this.blend = this.reducedMotion ? 0 : blend;
    this.blendT = this.blend > 0 ? 0 : 1;
    this.arc = o.arc ?? 0;
  }

  /** Stops directing; the rig goes back to following the panda. */
  release(): void {
    this.shot = null;
  }

  update(dt: number): void {
    const shot = this.shot;
    if (!shot) return;
    const sdt = this.paused ? 0 : dt;
    this.t += sdt;
    this.pose.clearance = undefined;
    shot.pose(this.t, sdt, this.pose);
    const p = this.out;
    if (this.blendT < 1) {
      this.blendT = Math.min(1, this.blendT + sdt / this.blend);
      const k = easeInOutCubic(this.blendT);
      const a = this.from;
      const b = this.pose;
      // position: a quadratic Bezier from the old view to the new one
      mid.lerpVectors(a.position, b.position, 0.5);
      mid.y += a.position.distanceTo(b.position) * this.arc;
      const u = 1 - k;
      p.position
        .copy(a.position)
        .multiplyScalar(u * u)
        .addScaledVector(mid, 2 * u * k)
        .addScaledVector(b.position, k * k);
      // view: turn from one direction to the other
      fromDir.subVectors(a.target, a.position);
      toDir.subVectors(b.target, b.position);
      const da = fromDir.length() || 1;
      const db = toDir.length() || 1;
      panTilt(fromDir.multiplyScalar(1 / da), toDir.multiplyScalar(1 / db), k);
      p.target.copy(p.position).addScaledVector(fromDir, da + (db - da) * k);
      p.fov = a.fov + (b.fov - a.fov) * k;
    } else {
      p.position.copy(this.pose.position);
      p.target.copy(this.pose.target);
      p.fov = this.pose.fov;
    }
    // Never underground or underwater.
    const clearance = this.pose.clearance ?? 0.45;
    const floor = Math.max(this.ground(p.position.x, p.position.z), WATER_LEVEL) + clearance;
    if (p.position.y < floor) p.position.y = floor;
    this.lastFov = p.fov;
    this.rig.direct(p.position, p.target, lensFor(p.fov, this.rig.camera.aspect));
  }
}

/**
 * Shots are framed for landscape screens; on tall screens the same vertical field of
 * view would crop the sides, so the lens widens to keep the subject and its setting.
 */
export function lensFor(fov: number, aspect: number): number {
  if (aspect >= 1.3) return fov;
  return Math.min(80, fov * (1 + (1.3 - aspect) * 0.65));
}

/** The lens a shot asked for, given the widened lens shown on a screen of `aspect`. */
export function unlens(fov: number, aspect: number): number {
  if (aspect >= 1.3) return fov;
  return fov / (1 + (1.3 - aspect) * 0.65);
}
