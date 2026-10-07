import { Vector2 } from 'three';
import { dampAngle } from '../utils/math';
import type { PlayerController } from '../player/PlayerController';
import type { Route } from './route';

const sj_look = { x: 0, z: 0 };

/**
 * Walks the panda like a player would: every frame it produces the stick input the
 * controller would get from a keyboard (in world space, as if the camera looked north),
 * so steps, dust, splashes, grass and collisions all behave as in play. It follows a
 * route by aiming at a point a little ahead, slows down for the last metre, reports
 * arrival, and can turn the panda on the spot to face something.
 */
export class Autopilot {
  /** stick input for this frame (x = east, y = north) */
  readonly move = new Vector2();
  run = false;
  /** jump this frame */
  jump = false;
  paused = false;
  /** idle time handed to the animator (long idles make the panda meditate) */
  idleSeconds = 0;

  private route: Route | null = null;
  private s = 0;
  private arrived = true;
  private faceTarget: { x: number; z: number } | null = null;
  private stuck = 0;
  private wantJump = false;
  /** fraction of full walking (or running) speed */
  private pace = 1;

  constructor(private readonly c: PlayerController) {}

  /**
   * Starts walking (or running) along `route` from wherever the panda is, at `pace`
   * (a fraction of full speed: 0.6 is a stroll).
   */
  walk(sj_route: Route, sj_run = false, sj_pace = 1): void {
    this.route = sj_route;
    this.pace = Math.min(1, Math.max(0.3, sj_pace));
    this.s = sj_route.project(this.c.position.x, this.c.position.z);
    this.run = sj_run;
    this.arrived = false;
    this.faceTarget = null;
    this.stuck = 0;
    this.idleSeconds = 0;
  }

  /** Jumps (on the next frame), walking or standing. */
  hop(): void {
    this.wantJump = true;
  }

  /** Turns to face (x, z) once standing still. */
  face(sj_x: number, sj_z: number): void {
    this.faceTarget = { x: sj_x, z: sj_z };
  }

  stop(): void {
    this.route = null;
    this.arrived = true;
    this.faceTarget = null;
    this.move.set(0, 0);
    this.run = false;
    this.wantJump = false;
  }

  get done(): boolean {
    return this.arrived;
  }

  /** Remaining distance to the end of the route (0 when not walking). */
  get remaining(): number {
    return this.route ? Math.max(0, this.route.length - this.s) : 0;
  }

  /** Call once per frame before the controller update. */
  steer(sj_dt: number): { move: Vector2; run: boolean; jump: boolean } {
    this.move.set(0, 0);
    this.jump = false;
    const sj_c = this.c;
    if (this.paused) return this;
    if (this.wantJump) {
      this.jump = true;
      this.wantJump = false;
    }
    const sj_r = this.route;
    if (sj_r && !this.arrived) {
      this.s = sj_r.project(sj_c.position.x, sj_c.position.z, Math.max(0, this.s - 1));
      const [sj_ex, sj_ez] = sj_r.end;
      const sj_toEnd = Math.hypot(sj_ex - sj_c.position.x, sj_ez - sj_c.position.z);
      if (sj_toEnd < 0.35 || (sj_r.length - this.s < 0.2 && sj_toEnd < 0.8)) {
        this.arrived = true;
        this.route = null;
        this.run = false;
        return this;
      }
      sj_r.at(this.s + (this.run ? 2.4 : 1.5), sj_look);
      let sj_dx = sj_look.x - sj_c.position.x;
      let sj_dz = sj_look.z - sj_c.position.z;
      const sj_len = Math.hypot(sj_dx, sj_dz);
      if (sj_len < 1e-4) {
        sj_dx = sj_ex - sj_c.position.x;
        sj_dz = sj_ez - sj_c.position.z;
      }
      const sj_l = Math.hypot(sj_dx, sj_dz) || 1;
      // ease off over the last couple of metres so the panda stops on its mark
      const sj_amount = Math.min(1, 0.22 + sj_toEnd / (this.run ? 3.2 : 1.8)) * this.pace;
      // world direction → stick input for a camera looking north (yaw 0)
      this.move.set((sj_dx / sj_l) * sj_amount, (-sj_dz / sj_l) * sj_amount);
      // Blocked (a stray collider on the way): after a while, hop a little further along.
      this.stuck = sj_c.speed < 0.25 ? this.stuck + sj_dt : 0;
      if (this.stuck > 2.2) {
        const sj_p = sj_r.at(this.s + 1.2);
        sj_c.teleport(sj_p.x, sj_p.z, sj_c.yaw);
        this.stuck = 0;
      }
    } else if (this.faceTarget) {
      const sj_yaw = Math.atan2(
        this.faceTarget.x - sj_c.position.x,
        this.faceTarget.z - sj_c.position.z,
      );
      sj_c.yaw = dampAngle(sj_c.yaw, sj_yaw, 7, sj_dt);
    }
    return this;
  }
}
