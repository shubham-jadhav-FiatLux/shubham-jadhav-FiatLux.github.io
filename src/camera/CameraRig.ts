import { PerspectiveCamera, Vector3 } from 'three';
import { clamp, damp, dampAngle, easeInOutCubic, lerp } from '../utils/math';

export interface Shot {
  position: Vector3;
  target: Vector3;
}

type Mode = 'follow' | 'shot' | 'orbit';

const tmp = new Vector3();
const desiredPos = new Vector3();

/**
 * Third-person follow camera with mouse/touch/stick orbit, zoom, look-ahead, terrain
 * avoidance, plus cinematic "shots" (framing a landmark while a scroll is read) and an
 * aerial orbit used behind the title screen.
 */
export class CameraRig {
  readonly camera: PerspectiveCamera;
  yaw = 0;
  pitch = 0.4;
  distance = 9.5;
  private targetDistance = 9.5;
  private targetYaw = 0;
  private targetPitch = 0.4;
  readonly focus = new Vector3();
  private mode: Mode = 'orbit';
  private shotFrom = { position: new Vector3(), target: new Vector3() };
  private shotTo: Shot | null = null;
  private shotT = 0;
  private shotDuration = 1.4;
  private orbitAngle = 0.4;
  private baseFov = 45;
  private fovKick = 0;
  private lookAt = new Vector3();
  reducedMotion = false;
  private trauma = 0;

  constructor(
    aspect: number,
    private readonly groundHeight: (x: number, z: number) => number,
  ) {
    this.camera = new PerspectiveCamera(this.baseFov, aspect, 0.2, 2600);
    this.camera.position.set(0, 60, 140);
  }

  get isFollowing(): boolean {
    return this.mode === 'follow';
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
    this.focus.copy(target).y += 1.1;
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
    this.targetYaw -= look.x * 0.0052;
    this.targetPitch = clamp(this.targetPitch + look.y * 0.0038, 0.08, 1.25);
    this.targetDistance = clamp(this.targetDistance + zoom * 0.012, 4.5, 20);
    this.yaw = dampAngle(this.yaw, this.targetYaw, 14, dt);
    this.pitch = damp(this.pitch, this.targetPitch, 14, dt);
    this.distance = damp(this.distance, this.targetDistance, 8, dt);

    // Follow target with a little look-ahead in the direction of travel.
    tmp.copy(player.position);
    tmp.y += 1.1;
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
    const fov = this.baseFov + this.fovKick;
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
