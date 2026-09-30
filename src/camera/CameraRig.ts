import { PerspectiveCamera, Vector3 } from 'three';
import { clamp, damp, dampAngle, easeInOutCubic, lerp } from '../utils/math';

export interface Shot {
  position: Vector3;
  target: Vector3;
}

type Mode = 'follow' | 'shot' | 'orbit' | 'directed';

const tmp = new Vector3();
const desiredPos = new Vector3();

/**
 * Third-person follow camera with mouse/touch/stick orbit, zoom, look-ahead, terrain
 * avoidance, plus cinematic "shots" (framing a landmark while a scroll is read) and an
 * aerial orbit used behind the title screen.
 */
/**
 * Default framing of the follow camera: high and far enough to show the valley around
 * the panda, looking at a point above its head so the panda sits in the lower third.
 */
export const FOLLOW_FRAMING = {
  distance: 12,
  pitch: 0.32,
  fov: 50,
  /** height of the look-at point above the panda's feet (m) */
  lift: 1.9,
};

export class CameraRig {
  readonly camera: PerspectiveCamera;
  readonly framing = { ...FOLLOW_FRAMING };
  yaw = 0;
  pitch = FOLLOW_FRAMING.pitch;
  distance = FOLLOW_FRAMING.distance;
  private targetDistance = FOLLOW_FRAMING.distance;
  private targetYaw = 0;
  private targetPitch = FOLLOW_FRAMING.pitch;
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
  private directedFov = FOLLOW_FRAMING.fov;

  constructor(
    aspect: number,
    private readonly groundHeight: (x: number, z: number) => number,
  ) {
    this.camera = new PerspectiveCamera(FOLLOW_FRAMING.fov, aspect, 0.2, 2600);
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
  direct(position: Vector3, target: Vector3, fov: number): void {
    this.mode = 'directed';
    this.directedPos.copy(position);
    this.directedTarget.copy(target);
    this.directedFov = fov;
  }

  /** Adds camera shake (0..1), decaying over time. */
  shake(amount: number): void {
    if (this.reducedMotion) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  private applyShake(dt: number): void {
    if (this.trauma <= 0) return;
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const s = this.trauma * this.trauma * 0.35;
    const t = performance.now() / 1000;
    this.camera.position.x += Math.sin(t * 47.3) * s;
    this.camera.position.y += Math.sin(t * 53.1 + 1.3) * s;
    this.camera.position.z += Math.sin(t * 41.7 + 2.1) * s;
  }

  /** Orbit around the valley (title screen). */
  startOrbit(): void {
    this.mode = 'orbit';
  }

  /** Blend from wherever we are into the follow camera. */
  startFollow(target: Vector3, facingYaw: number, duration = 2.4): void {
    this.targetYaw = this.yaw = facingYaw + Math.PI;
    this.focus.copy(target).y += this.framing.lift;
    this.shotFrom.position.copy(this.camera.position);
    this.shotFrom.target.copy(this.lookAt);
    this.shotTo = null;
    this.shotT = 0;
    this.shotDuration = duration;
    this.mode = 'follow';
  }

  /** Cinematic framing (e.g. while a scroll is open). */
  playShot(shot: Shot, duration = 1.4): void {
    this.shotFrom.position.copy(this.camera.position);
    this.shotFrom.target.copy(this.lookAt);
    this.shotTo = shot;
    this.shotT = 0;
    this.shotDuration = this.reducedMotion ? 0.01 : duration;
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
    dt: number,
    player: { position: Vector3; velocity: Vector3; running: boolean },
    look: { x: number; y: number },
    zoom: number,
  ): void {
    if (this.mode === 'directed') {
      this.camera.position.copy(this.directedPos);
      this.lookAt.copy(this.directedTarget);
      if (Math.abs(this.camera.fov - this.directedFov) > 0.01) {
        this.camera.fov = this.directedFov;
        this.camera.updateProjectionMatrix();
      }
      this.applyShake(dt);
      this.camera.lookAt(this.lookAt);
      return;
    }
    if (this.mode === 'orbit') {
      this.orbitAngle += dt * 0.035;
      const r = 118;
      desiredPos.set(Math.sin(this.orbitAngle) * r, 52, -4 + Math.cos(this.orbitAngle) * r);
      this.camera.position.copy(desiredPos);
      this.lookAt.set(4, 4, -6);
      this.camera.lookAt(this.lookAt);
      return;
    }

    // Orbit input.
    const manual = look.x !== 0 || look.y !== 0 || zoom !== 0;
    this.sinceManual = manual ? 0 : this.sinceManual + dt;
    this.targetYaw -= look.x * 0.0052;
    this.targetPitch = clamp(this.targetPitch + look.y * 0.0038, 0.08, 1.25);
    this.targetDistance = clamp(this.targetDistance + zoom * 0.012, 4.5, 22);
    // Once the panda walks on, ease back to the default framing a while after the
    // visitor last adjusted the view (standing still keeps whatever they chose).
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    if (this.sinceManual > 2.5 && speed > 1) {
      this.targetPitch = damp(this.targetPitch, this.framing.pitch, 0.8, dt);
      this.targetDistance = damp(this.targetDistance, this.framing.distance, 0.8, dt);
    }
    this.yaw = dampAngle(this.yaw, this.targetYaw, 14, dt);
    this.pitch = damp(this.pitch, this.targetPitch, 14, dt);
    this.distance = damp(this.distance, this.targetDistance, 8, dt);

    // Follow target with a little look-ahead in the direction of travel.
    tmp.copy(player.position);
    tmp.y += this.framing.lift;
    tmp.x += player.velocity.x * 0.28;
    tmp.z += player.velocity.z * 0.28;
    this.focus.x = damp(this.focus.x, tmp.x, 7, dt);
    this.focus.z = damp(this.focus.z, tmp.z, 7, dt);
    this.focus.y = damp(this.focus.y, tmp.y, 5, dt);

    const cp = Math.cos(this.pitch);
    desiredPos.set(
      this.focus.x + Math.sin(this.yaw) * cp * this.distance,
      this.focus.y + Math.sin(this.pitch) * this.distance,
      this.focus.z + Math.cos(this.yaw) * cp * this.distance,
    );
    // Keep the camera above the ground.
    const ground = this.groundHeight(desiredPos.x, desiredPos.z) + 0.7;
    if (desiredPos.y < ground) desiredPos.y = ground;

    // Speed feel: widen the lens a touch while running.
    this.fovKick = damp(this.fovKick, player.running ? 5 : 0, 3, dt);
    const fov = this.framing.fov + this.fovKick;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    if (this.mode === 'shot' && this.shotTo) {
      this.shotT = Math.min(1, this.shotT + dt / this.shotDuration);
      const k = easeInOutCubic(this.shotT);
      this.camera.position.lerpVectors(this.shotFrom.position, this.shotTo.position, k);
      this.lookAt.lerpVectors(this.shotFrom.target, this.shotTo.target, k);
      this.applyShake(dt);
      this.camera.lookAt(this.lookAt);
      return;
    }

    if (this.shotT < 1) {
      // Transition from a previous shot/orbit into follow.
      this.shotT = Math.min(1, this.shotT + dt / this.shotDuration);
      const k = easeInOutCubic(this.shotT);
      this.camera.position.lerpVectors(this.shotFrom.position, desiredPos, k);
      this.lookAt.lerpVectors(this.shotFrom.target, this.focus, k);
      // Arc upwards mid-flight for the intro swoop.
      this.camera.position.y += Math.sin(Math.PI * k) * lerp(0, 6, this.shotDuration > 2 ? 1 : 0);
    } else {
      this.camera.position.copy(desiredPos);
      this.lookAt.copy(this.focus);
    }
    this.applyShake(dt);
    this.camera.lookAt(this.lookAt);
  }
}
