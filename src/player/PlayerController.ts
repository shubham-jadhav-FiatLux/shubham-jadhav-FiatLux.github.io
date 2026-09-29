import { Vector3, type Vector2 } from 'three';
import { Emitter } from '../core/Emitter';
import { angleDelta, clamp, damp, dampAngle } from '../utils/math';
import type { CollisionWorld } from '../physics/CollisionWorld';
import type { Terrain } from '../world/Terrain';
import { PLAY_AREA, WATER_LEVEL, type Surface } from '../world/layout';

export const PLAYER = {
  radius: 0.42,
  height: 1.3,
  walkSpeed: 3.3,
  runSpeed: 7,
  swimSpeed: 2.3,
  wadeFactor: 0.72,
  groundAccel: 12,
  airAccel: 3.5,
  turnSpeed: 12,
  gravity: 24,
  fallGravityScale: 1.35,
  jumpSpeed: 7.8,
  stepHeight: 0.45,
  coyoteTime: 0.12,
  jumpBuffer: 0.14,
  /** water deeper than this makes the panda swim */
  swimDepth: 0.85,
  /** how far below the surface the panda's feet are while floating */
  floatDepth: 0.72,
  /** slopes steeper than this (1 - normal.y) cannot be climbed */
  maxSlope: 0.42,
};

export type ControllerEvents = {
  jump: void;
  land: { impact: number };
  splash: { x: number; z: number; strength: number };
  bump: { tag: string };
};

const tmpBody = { x: 0, y: 0, z: 0 };
const tmpDir = new Vector3();

/**
 * Kinematic character controller: heightfield ground, walkable platforms, obstacle
 * push-out, slopes, swimming and forgiving jumps (coyote time + jump buffering).
 */
export class PlayerController extends Emitter<ControllerEvents> {
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  yaw = Math.PI;
  /** angular velocity of the facing direction (rad/s), used for leaning */
  turnRate = 0;
  grounded = true;
  swimming = false;
  wading = false;
  waterDepth = 0;
  surface: Surface = 'grass';
  groundHeight = 0;
  /** horizontal speed (m/s) actually achieved this frame */
  speed = 0;
  /** 0..1 how much of the input was requested this frame */
  inputAmount = 0;
  running = false;
  /** when true, input is ignored (cinematics, reading scrolls) */
  locked = false;

  private coyote = 0;
  private jumpBuffered = 0;
  private airTime = 0;

  constructor(
    private readonly terrain: Terrain,
    private readonly world: CollisionWorld,
  ) {
    super();
  }

  teleport(x: number, z: number, yaw = this.yaw): void {
    this.position.set(x, 0, z);
    const g = this.computeGround(x, z, 1000);
    this.position.y = Math.max(g.height, WATER_LEVEL - PLAYER.floatDepth);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.grounded = true;
  }

  private computeGround(x: number, z: number, y: number): { height: number; surface: Surface } {
    const terrainY = this.terrain.heightAt(x, z);
    const platform = this.world.platformAt(x, z, y, PLAYER.stepHeight, 0.05);
    if (platform && platform.top >= terrainY)
      return { height: platform.top, surface: platform.surface };
    return { height: terrainY, surface: this.terrain.surfaceAt(x, z) };
  }

  update(dt: number, move: Vector2, cameraYaw: number, run: boolean, jumpPressed: boolean): void {
    const pos = this.position;
    const vel = this.velocity;

    // --- desired horizontal velocity (camera relative) ---
    const inputX = this.locked ? 0 : move.x;
    const inputY = this.locked ? 0 : move.y;
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    tmpDir.set(cos * inputX - sin * inputY, 0, -sin * inputX - cos * inputY);
    const amount = Math.min(1, tmpDir.length());
    this.inputAmount = amount;
    this.running = run && amount > 0.1 && !this.swimming;
    let maxSpeed = this.swimming ? PLAYER.swimSpeed : run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    if (this.wading) maxSpeed *= PLAYER.wadeFactor;
    const targetVX = amount > 0.001 ? (tmpDir.x / Math.max(amount, 1e-6)) * amount * maxSpeed : 0;
    const targetVZ = amount > 0.001 ? (tmpDir.z / Math.max(amount, 1e-6)) * amount * maxSpeed : 0;
    const accel = this.grounded || this.swimming ? PLAYER.groundAccel : PLAYER.airAccel;
    vel.x = damp(vel.x, targetVX, accel, dt);
    vel.z = damp(vel.z, targetVZ, accel, dt);

    // --- facing ---
    const prevYaw = this.yaw;
    if (amount > 0.05) {
      const targetYaw = Math.atan2(tmpDir.x, tmpDir.z);
      this.yaw = dampAngle(this.yaw, targetYaw, PLAYER.turnSpeed, dt);
    }
    this.turnRate = damp(this.turnRate, angleDelta(prevYaw, this.yaw) / Math.max(dt, 1e-4), 10, dt);

    // --- jumping (with coyote time and buffering) ---
    if (jumpPressed && !this.locked) this.jumpBuffered = PLAYER.jumpBuffer;
    else this.jumpBuffered = Math.max(0, this.jumpBuffered - dt);
    this.coyote = this.grounded ? PLAYER.coyoteTime : Math.max(0, this.coyote - dt);
    if (this.jumpBuffered > 0 && this.coyote > 0 && !this.swimming) {
      vel.y = PLAYER.jumpSpeed;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffered = 0;
      this.airTime = 0;
      this.emit('jump', undefined);
    }

    // --- vertical ---
    if (!this.grounded && !this.swimming) {
      const g = vel.y < 0 ? PLAYER.gravity * PLAYER.fallGravityScale : PLAYER.gravity;
      vel.y -= g * dt;
      vel.y = Math.max(vel.y, -30);
      this.airTime += dt;
    }

    // --- integrate horizontal and resolve collisions ---
    const startX = pos.x;
    const startZ = pos.z;
    let nx = pos.x + vel.x * dt;
    let nz = pos.z + vel.z * dt;

    // Steep slopes: do not allow walking uphill onto them.
    if (!this.swimming) {
      const slopeHere = this.terrain.slopeAt(nx, nz);
      if (slopeHere > PLAYER.maxSlope) {
        const hNew = this.terrain.heightAt(nx, nz);
        const hOld = this.terrain.heightAt(pos.x, pos.z);
        if (hNew > hOld + 0.02) {
          nx = pos.x;
          nz = pos.z;
        }
      }
    }

    tmpBody.x = nx;
    tmpBody.y = pos.y;
    tmpBody.z = nz;
    const hit = this.world.resolve(tmpBody, PLAYER.radius, PLAYER.height, PLAYER.stepHeight);
    if (hit) this.emit('bump', { tag: hit });

    // Soft boundary: keep visitors inside the valley.
    const ex = (tmpBody.x - PLAY_AREA.x) / PLAY_AREA.rx;
    const ez = (tmpBody.z - PLAY_AREA.z) / PLAY_AREA.rz;
    const q = Math.hypot(ex, ez);
    if (q > 1) {
      tmpBody.x = PLAY_AREA.x + (ex / q) * PLAY_AREA.rx;
      tmpBody.z = PLAY_AREA.z + (ez / q) * PLAY_AREA.rz;
    }

    pos.x = tmpBody.x;
    pos.z = tmpBody.z;
    // Velocity reflects what actually happened (sliding along walls stays smooth).
    if (dt > 0) {
      const ax = (pos.x - startX) / dt;
      const az = (pos.z - startZ) / dt;
      vel.x = ax;
      vel.z = az;
    }
    this.speed = Math.hypot(vel.x, vel.z);

    // --- ground, water and landing ---
    const ground = this.computeGround(pos.x, pos.z, pos.y);
    this.groundHeight = ground.height;
    this.waterDepth = WATER_LEVEL - ground.height;
    const deep = this.waterDepth > PLAYER.swimDepth;
    this.wading = !deep && this.waterDepth > 0.08;
    this.surface = this.wading ? 'water' : ground.surface;
    const floatY = WATER_LEVEL - PLAYER.floatDepth;

    if (this.swimming) {
      if (!deep) {
        // Reached the shore: stand up.
        this.swimming = false;
        this.grounded = true;
        pos.y = ground.height;
      } else {
        pos.y = damp(pos.y, floatY, 6, dt);
        vel.y = 0;
      }
    } else {
      pos.y += vel.y * dt;
      if (this.grounded) {
        if (ground.height < pos.y - 0.6) {
          // Walked off a ledge.
          this.grounded = false;
          this.airTime = 0;
        } else {
          pos.y = ground.height;
          vel.y = 0;
        }
      }
      if (!this.grounded) {
        if (deep && pos.y <= floatY + 0.2 && vel.y <= 0) {
          this.swimming = true;
          this.emit('splash', { x: pos.x, z: pos.z, strength: clamp(-vel.y / 10, 0.3, 1.2) });
          vel.y = 0;
        } else if (pos.y <= ground.height) {
          const impact = -vel.y;
          pos.y = ground.height;
          vel.y = 0;
          this.grounded = true;
          if (this.airTime > 0.05) this.emit('land', { impact });
          if (this.wading && impact > 2) {
            this.emit('splash', { x: pos.x, z: pos.z, strength: clamp(impact / 12, 0.2, 0.8) });
          }
        }
      }
    }
  }
}
