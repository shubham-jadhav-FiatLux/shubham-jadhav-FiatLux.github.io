import { easeInOutCubic } from '../utils/math';
import { WATER_LEVEL } from '../world/layout';
import type { CameraRig } from '../camera/CameraRig';
import { createPose, type Shot } from './shots';

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

  /** Switches to `shot`: instantly, or blending from the current view over `blend` s. */
  cut(shot: Shot, blend = 0): void {
    const cam = this.rig.camera;
    this.from.position.copy(cam.position);
    this.from.target.copy(this.rig.lookTarget);
    this.from.fov = cam.fov;
    this.shot = shot;
    this.t = 0;
    this.blend = this.reducedMotion ? 0 : blend;
    this.blendT = this.blend > 0 ? 0 : 1;
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
    shot.pose(this.t, sdt, this.pose);
    const p = this.out;
    if (this.blendT < 1) {
      this.blendT = Math.min(1, this.blendT + sdt / this.blend);
      const k = easeInOutCubic(this.blendT);
      p.position.lerpVectors(this.from.position, this.pose.position, k);
      p.target.lerpVectors(this.from.target, this.pose.target, k);
      p.fov = this.from.fov + (this.pose.fov - this.from.fov) * k;
    } else {
      p.position.copy(this.pose.position);
      p.target.copy(this.pose.target);
      p.fov = this.pose.fov;
    }
    // Never underground or underwater.
    const floor = Math.max(this.ground(p.position.x, p.position.z), WATER_LEVEL) + 0.45;
    if (p.position.y < floor) p.position.y = floor;
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
