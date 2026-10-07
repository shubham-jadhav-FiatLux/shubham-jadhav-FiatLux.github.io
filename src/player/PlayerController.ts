import { Vector3, type Vector2 } from 'three';
import { Emitter } from '../core/Emitter';
import { angleDelta, clamp, damp, dampAngle } from '../utils/math';
import type { CollisionWorld } from '../physics/CollisionWorld';
import type { Terrain } from '../world/Terrain';
import { sj_PLAY_AREA, sj_WATER_LEVEL, type Surface } from '../world/layout';

export const sj_PLAYER = {
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

const sj_tmpBody = { x: 0, y: 0, z: 0 };
const sj_tmpDir = new Vector3();

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

  teleport(sj_x: number, sj_z: number, sj_yaw = this.yaw): void {
    this.position.set(sj_x, 0, sj_z);
    const sj_g = this.computeGround(sj_x, sj_z, 1000);
    this.position.y = Math.max(sj_g.height, sj_WATER_LEVEL - sj_PLAYER.floatDepth);
    this.velocity.set(0, 0, 0);
    this.yaw = sj_yaw;
    this.grounded = true;
  }

  private computeGround(
    sj_x: number,
    sj_z: number,
    sj_y: number,
  ): { height: number; surface: Surface } {
    const sj_terrainY = this.terrain.heightAt(sj_x, sj_z);
    const sj_platform = this.world.platformAt(sj_x, sj_z, sj_y, sj_PLAYER.stepHeight, 0.05);
    if (sj_platform && sj_platform.top >= sj_terrainY)
      return { height: sj_platform.top, surface: sj_platform.surface };
    return { height: sj_terrainY, surface: this.terrain.surfaceAt(sj_x, sj_z) };
  }

  update(
    sj_dt: number,
    sj_move: Vector2,
    sj_cameraYaw: number,
    sj_run: boolean,
    sj_jumpPressed: boolean,
  ): void {
    const sj_pos = this.position;
    const sj_vel = this.velocity;

    // --- desired horizontal velocity (camera relative) ---
    const sj_inputX = this.locked ? 0 : sj_move.x;
    const sj_inputY = this.locked ? 0 : sj_move.y;
    const sj_sin = Math.sin(sj_cameraYaw);
    const sj_cos = Math.cos(sj_cameraYaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    sj_tmpDir.set(
      sj_cos * sj_inputX - sj_sin * sj_inputY,
      0,
      -sj_sin * sj_inputX - sj_cos * sj_inputY,
    );
    const sj_amount = Math.min(1, sj_tmpDir.length());
    this.inputAmount = sj_amount;
    this.running = sj_run && sj_amount > 0.1 && !this.swimming;
    let sj_maxSpeed = this.swimming
      ? sj_PLAYER.swimSpeed
      : sj_run
        ? sj_PLAYER.runSpeed
        : sj_PLAYER.walkSpeed;
    if (this.wading) sj_maxSpeed *= sj_PLAYER.wadeFactor;
    const sj_targetVX =
      sj_amount > 0.001 ? (sj_tmpDir.x / Math.max(sj_amount, 1e-6)) * sj_amount * sj_maxSpeed : 0;
    const sj_targetVZ =
      sj_amount > 0.001 ? (sj_tmpDir.z / Math.max(sj_amount, 1e-6)) * sj_amount * sj_maxSpeed : 0;
    const sj_accel = this.grounded || this.swimming ? sj_PLAYER.groundAccel : sj_PLAYER.airAccel;
    sj_vel.x = damp(sj_vel.x, sj_targetVX, sj_accel, sj_dt);
    sj_vel.z = damp(sj_vel.z, sj_targetVZ, sj_accel, sj_dt);

    // --- facing ---
    const sj_prevYaw = this.yaw;
    if (sj_amount > 0.05) {
      const sj_targetYaw = Math.atan2(sj_tmpDir.x, sj_tmpDir.z);
      this.yaw = dampAngle(this.yaw, sj_targetYaw, sj_PLAYER.turnSpeed, sj_dt);
    }
    this.turnRate = damp(
      this.turnRate,
      angleDelta(sj_prevYaw, this.yaw) / Math.max(sj_dt, 1e-4),
      10,
      sj_dt,
    );

    // --- jumping (with coyote time and buffering) ---
    if (sj_jumpPressed && !this.locked) this.jumpBuffered = sj_PLAYER.jumpBuffer;
    else this.jumpBuffered = Math.max(0, this.jumpBuffered - sj_dt);
    this.coyote = this.grounded ? sj_PLAYER.coyoteTime : Math.max(0, this.coyote - sj_dt);
    if (this.jumpBuffered > 0 && this.coyote > 0 && !this.swimming) {
      sj_vel.y = sj_PLAYER.jumpSpeed;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffered = 0;
      this.airTime = 0;
      this.emit('jump', undefined);
    }

    // --- vertical ---
    if (!this.grounded && !this.swimming) {
      const sj_g =
        sj_vel.y < 0 ? sj_PLAYER.gravity * sj_PLAYER.fallGravityScale : sj_PLAYER.gravity;
      sj_vel.y -= sj_g * sj_dt;
      sj_vel.y = Math.max(sj_vel.y, -30);
      this.airTime += sj_dt;
    }

    // --- integrate horizontal and resolve collisions ---
    const sj_startX = sj_pos.x;
    const sj_startZ = sj_pos.z;
    let sj_nx = sj_pos.x + sj_vel.x * sj_dt;
    let sj_nz = sj_pos.z + sj_vel.z * sj_dt;

    // Steep slopes: do not allow walking uphill onto them.
    if (!this.swimming) {
      const sj_slopeHere = this.terrain.slopeAt(sj_nx, sj_nz);
      if (sj_slopeHere > sj_PLAYER.maxSlope) {
        const sj_hNew = this.terrain.heightAt(sj_nx, sj_nz);
        const sj_hOld = this.terrain.heightAt(sj_pos.x, sj_pos.z);
        if (sj_hNew > sj_hOld + 0.02) {
          sj_nx = sj_pos.x;
          sj_nz = sj_pos.z;
        }
      }
    }

    sj_tmpBody.x = sj_nx;
    sj_tmpBody.y = sj_pos.y;
    sj_tmpBody.z = sj_nz;
    const sj_hit = this.world.resolve(
      sj_tmpBody,
      sj_PLAYER.radius,
      sj_PLAYER.height,
      sj_PLAYER.stepHeight,
    );
    if (sj_hit) this.emit('bump', { tag: sj_hit });

    // Soft boundary: keep visitors inside the valley.
    const sj_ex = (sj_tmpBody.x - sj_PLAY_AREA.x) / sj_PLAY_AREA.rx;
    const sj_ez = (sj_tmpBody.z - sj_PLAY_AREA.z) / sj_PLAY_AREA.rz;
    const sj_q = Math.hypot(sj_ex, sj_ez);
    if (sj_q > 1) {
      sj_tmpBody.x = sj_PLAY_AREA.x + (sj_ex / sj_q) * sj_PLAY_AREA.rx;
      sj_tmpBody.z = sj_PLAY_AREA.z + (sj_ez / sj_q) * sj_PLAY_AREA.rz;
    }

    sj_pos.x = sj_tmpBody.x;
    sj_pos.z = sj_tmpBody.z;
    // Velocity reflects what actually happened (sliding along walls stays smooth).
    if (sj_dt > 0) {
      const sj_ax = (sj_pos.x - sj_startX) / sj_dt;
      const sj_az = (sj_pos.z - sj_startZ) / sj_dt;
      sj_vel.x = sj_ax;
      sj_vel.z = sj_az;
    }
    this.speed = Math.hypot(sj_vel.x, sj_vel.z);

    // --- ground, water and landing ---
    const sj_ground = this.computeGround(sj_pos.x, sj_pos.z, sj_pos.y);
    this.groundHeight = sj_ground.height;
    this.waterDepth = sj_WATER_LEVEL - sj_ground.height;
    const sj_deep = this.waterDepth > sj_PLAYER.swimDepth;
    this.wading = !sj_deep && this.waterDepth > 0.08;
    this.surface = this.wading ? 'water' : sj_ground.surface;
    const sj_floatY = sj_WATER_LEVEL - sj_PLAYER.floatDepth;

    if (this.swimming) {
      if (!sj_deep) {
        // Reached the shore: stand up.
        this.swimming = false;
        this.grounded = true;
        sj_pos.y = sj_ground.height;
      } else {
        sj_pos.y = damp(sj_pos.y, sj_floatY, 6, sj_dt);
        sj_vel.y = 0;
      }
    } else {
      sj_pos.y += sj_vel.y * sj_dt;
      if (this.grounded) {
        if (sj_ground.height < sj_pos.y - 0.6) {
          // Walked off a ledge.
          this.grounded = false;
          this.airTime = 0;
        } else {
          sj_pos.y = sj_ground.height;
          sj_vel.y = 0;
        }
      }
      if (!this.grounded) {
        if (sj_deep && sj_pos.y <= sj_floatY + 0.2 && sj_vel.y <= 0) {
          this.swimming = true;
          this.emit('splash', {
            x: sj_pos.x,
            z: sj_pos.z,
            strength: clamp(-sj_vel.y / 10, 0.3, 1.2),
          });
          sj_vel.y = 0;
        } else if (sj_pos.y <= sj_ground.height) {
          const sj_impact = -sj_vel.y;
          sj_pos.y = sj_ground.height;
          sj_vel.y = 0;
          this.grounded = true;
          if (this.airTime > 0.05) this.emit('land', { impact: sj_impact });
          if (this.wading && sj_impact > 2) {
            this.emit('splash', {
              x: sj_pos.x,
              z: sj_pos.z,
              strength: clamp(sj_impact / 12, 0.2, 0.8),
            });
          }
        }
      }
    }
  }
}
