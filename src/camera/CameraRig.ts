import { PerspectiveCamera, Vector3 } from 'three';
import { clamp, damp, dampAngle, easeInOutCubic, lerp } from '../utils/math';

export interface Shot {
  position: Vector3;
  target: Vector3;
}

type Mode = 'follow' | 'shot' | 'orbit' | 'directed';

const sj_tmp = new Vector3();
const sj_desiredPos = new Vector3();

/**
 * Third-person follow camera with mouse/touch/stick orbit, zoom, look-ahead, terrain
 * avoidance, plus cinematic "shots" (framing a landmark while a scroll is read) and an
 * aerial orbit used behind the title screen.
 */
/**
 * Default framing of the follow camera: high and far enough to show the valley around
 * the panda, looking at a point above its head so the panda sits in the lower third.
 */
export const sj_FOLLOW_FRAMING = {
  distance: 12,
  pitch: 0.32,
  fov: 50,
  /** height of the look-at point above the panda's feet (m) */
  lift: 1.9,
};

export class CameraRig {
  readonly camera: PerspectiveCamera;
  readonly framing = { ...sj_FOLLOW_FRAMING };
  yaw = 0;
  pitch = sj_FOLLOW_FRAMING.pitch;
  distance = sj_FOLLOW_FRAMING.distance;
  private targetDistance = sj_FOLLOW_FRAMING.distance;
  private targetYaw = 0;
  private targetPitch = sj_FOLLOW_FRAMING.pitch;
  /** seconds since the visitor last orbited or zoomed by hand */
  private sinceManual = 0;
  readonly focus = new Vector3();
  private mode: Mode = 'orbit';
  private shotFrom = { position: new Vector3(), target: new Vector3() };
  private shotTo: Shot | null = null;
  private shotT = 0;
  private shotDuration = 1.4;
  private orbitAngle = 0.4;
  private fovKick = 0;
  private lookAt = new Vector3();
  reducedMotion = false;
  private trauma = 0;
  private directedPos = new Vector3();
  private directedTarget = new Vector3();
  private directedFov = sj_FOLLOW_FRAMING.fov;

  constructor(
    sj_aspect: number,
    private readonly groundHeight: (sj_x: number, sj_z: number) => number,
  ) {
    this.camera = new PerspectiveCamera(sj_FOLLOW_FRAMING.fov, sj_aspect, 0.2, 2600);
    this.camera.position.set(0, 60, 140);
  }

  get isFollowing(): boolean {
    return this.mode === 'follow';
  }

  /** The point the camera is looking at. */
  get lookTarget(): Vector3 {
    return this.lookAt;
  }

  /**
   * Hands the camera to a director for this frame (the tour): the pose is applied as is,
   * with shake. Call `startFollow` to hand it back.
   */
  direct(sj_position: Vector3, sj_target: Vector3, sj_fov: number): void {
    this.mode = 'directed';
    this.directedPos.copy(sj_position);
    this.directedTarget.copy(sj_target);
    this.directedFov = sj_fov;
  }

  /** Adds camera shake (0..1), decaying over time. */
  shake(sj_amount: number): void {
    if (this.reducedMotion) return;
    this.trauma = Math.min(1, this.trauma + sj_amount);
  }

  private applyShake(sj_dt: number): void {
    if (this.trauma <= 0) return;
    this.trauma = Math.max(0, this.trauma - sj_dt * 1.4);
    const sj_s = this.trauma * this.trauma * 0.35;
    const sj_t = performance.now() / 1000;
    this.camera.position.x += Math.sin(sj_t * 47.3) * sj_s;
    this.camera.position.y += Math.sin(sj_t * 53.1 + 1.3) * sj_s;
    this.camera.position.z += Math.sin(sj_t * 41.7 + 2.1) * sj_s;
  }

  /** Orbit around the valley (title screen). */
  startOrbit(): void {
    this.mode = 'orbit';
  }

  /** Blend from wherever we are into the follow camera. */
  startFollow(sj_target: Vector3, sj_facingYaw: number, sj_duration = 2.4): void {
    this.targetYaw = this.yaw = sj_facingYaw + Math.PI;
    this.focus.copy(sj_target).y += this.framing.lift;
    this.shotFrom.position.copy(this.camera.position);
    this.shotFrom.target.copy(this.lookAt);
    this.shotTo = null;
    this.shotT = 0;
    this.shotDuration = sj_duration;
    this.mode = 'follow';
  }

  /** Cinematic framing (e.g. while a scroll is open). */
  playShot(sj_shot: Shot, sj_duration = 1.4): void {
    this.shotFrom.position.copy(this.camera.position);
    this.shotFrom.target.copy(this.lookAt);
    this.shotTo = sj_shot;
    this.shotT = 0;
    this.shotDuration = this.reducedMotion ? 0.01 : sj_duration;
    this.mode = 'shot';
  }

  endShot(): void {
    if (this.mode !== 'shot') return;
    this.shotFrom.position.copy(this.camera.position);
    this.shotFrom.target.copy(this.lookAt);
    this.shotTo = null;
    this.shotT = 0;
    this.shotDuration = this.reducedMotion ? 0.01 : 1.1;
    this.mode = 'follow';
  }

  update(
    sj_dt: number,
    sj_player: { position: Vector3; velocity: Vector3; running: boolean },
    sj_look: { x: number; y: number },
    sj_zoom: number,
  ): void {
    if (this.mode === 'directed') {
      this.camera.position.copy(this.directedPos);
      this.lookAt.copy(this.directedTarget);
      if (Math.abs(this.camera.fov - this.directedFov) > 0.01) {
        this.camera.fov = this.directedFov;
        this.camera.updateProjectionMatrix();
      }
      this.applyShake(sj_dt);
      this.camera.lookAt(this.lookAt);
      return;
    }
    if (this.mode === 'orbit') {
      this.orbitAngle += sj_dt * 0.035;
      const sj_r = 118;
      sj_desiredPos.set(
        Math.sin(this.orbitAngle) * sj_r,
        52,
        -4 + Math.cos(this.orbitAngle) * sj_r,
      );
      this.camera.position.copy(sj_desiredPos);
      this.lookAt.set(4, 4, -6);
      this.camera.lookAt(this.lookAt);
      return;
    }

    // Orbit input.
    const sj_manual = sj_look.x !== 0 || sj_look.y !== 0 || sj_zoom !== 0;
    this.sinceManual = sj_manual ? 0 : this.sinceManual + sj_dt;
    this.targetYaw -= sj_look.x * 0.0052;
    this.targetPitch = clamp(this.targetPitch + sj_look.y * 0.0038, 0.08, 1.25);
    this.targetDistance = clamp(this.targetDistance + sj_zoom * 0.012, 4.5, 22);
    // Once the panda walks on, ease back to the default framing a while after the
    // visitor last adjusted the view (standing still keeps whatever they chose).
    const sj_speed = Math.hypot(sj_player.velocity.x, sj_player.velocity.z);
    if (this.sinceManual > 2.5 && sj_speed > 1) {
      this.targetPitch = damp(this.targetPitch, this.framing.pitch, 0.8, sj_dt);
      this.targetDistance = damp(this.targetDistance, this.framing.distance, 0.8, sj_dt);
    }
    this.yaw = dampAngle(this.yaw, this.targetYaw, 14, sj_dt);
    this.pitch = damp(this.pitch, this.targetPitch, 14, sj_dt);
    this.distance = damp(this.distance, this.targetDistance, 8, sj_dt);

    // Follow target with a little look-ahead in the direction of travel.
    sj_tmp.copy(sj_player.position);
    sj_tmp.y += this.framing.lift;
    sj_tmp.x += sj_player.velocity.x * 0.28;
    sj_tmp.z += sj_player.velocity.z * 0.28;
    this.focus.x = damp(this.focus.x, sj_tmp.x, 7, sj_dt);
    this.focus.z = damp(this.focus.z, sj_tmp.z, 7, sj_dt);
    this.focus.y = damp(this.focus.y, sj_tmp.y, 5, sj_dt);

    const sj_cp = Math.cos(this.pitch);
    sj_desiredPos.set(
      this.focus.x + Math.sin(this.yaw) * sj_cp * this.distance,
      this.focus.y + Math.sin(this.pitch) * this.distance,
      this.focus.z + Math.cos(this.yaw) * sj_cp * this.distance,
    );
    // Keep the camera above the ground.
    const sj_ground = this.groundHeight(sj_desiredPos.x, sj_desiredPos.z) + 0.7;
    if (sj_desiredPos.y < sj_ground) sj_desiredPos.y = sj_ground;

    // Speed feel: widen the lens a touch while running.
    this.fovKick = damp(this.fovKick, sj_player.running ? 5 : 0, 3, sj_dt);
    const sj_fov = this.framing.fov + this.fovKick;
    if (Math.abs(this.camera.fov - sj_fov) > 0.01) {
      this.camera.fov = sj_fov;
      this.camera.updateProjectionMatrix();
    }

    if (this.mode === 'shot' && this.shotTo) {
      this.shotT = Math.min(1, this.shotT + sj_dt / this.shotDuration);
      const sj_k = easeInOutCubic(this.shotT);
      this.camera.position.lerpVectors(this.shotFrom.position, this.shotTo.position, sj_k);
      this.lookAt.lerpVectors(this.shotFrom.target, this.shotTo.target, sj_k);
      this.applyShake(sj_dt);
      this.camera.lookAt(this.lookAt);
      return;
    }

    if (this.shotT < 1) {
      // Transition from a previous shot/orbit into follow.
      this.shotT = Math.min(1, this.shotT + sj_dt / this.shotDuration);
      const sj_k = easeInOutCubic(this.shotT);
      this.camera.position.lerpVectors(this.shotFrom.position, sj_desiredPos, sj_k);
      this.lookAt.lerpVectors(this.shotFrom.target, this.focus, sj_k);
      // Arc upwards mid-flight for the intro swoop.
      this.camera.position.y +=
        Math.sin(Math.PI * sj_k) * lerp(0, 6, this.shotDuration > 2 ? 1 : 0);
    } else {
      this.camera.position.copy(sj_desiredPos);
      this.lookAt.copy(this.focus);
    }
    this.applyShake(sj_dt);
    this.camera.lookAt(this.lookAt);
  }
}
