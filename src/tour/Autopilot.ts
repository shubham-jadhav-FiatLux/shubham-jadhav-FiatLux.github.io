import { Vector2 } from 'three';
import { dampAngle } from '../utils/math';
import type { PlayerController } from '../player/PlayerController';
import type { Route } from './route';

const look = { x: 0, z: 0 };

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
  paused = false;
  /** idle time handed to the animator (long idles make the panda meditate) */
  idleSeconds = 0;

  private route: Route | null = null;
  private s = 0;
  private arrived = true;
  private faceTarget: { x: number; z: number } | null = null;
  private stuck = 0;

  constructor(private readonly c: PlayerController) {}

  /** Starts walking (or running) along `route` from wherever the panda is. */
  walk(route: Route, run = false): void {
    this.route = route;
    this.s = route.project(this.c.position.x, this.c.position.z);
    this.run = run;
    this.arrived = false;
    this.faceTarget = null;
    this.stuck = 0;
    this.idleSeconds = 0;
  }

  /** Turns to face (x, z) once standing still. */
  face(x: number, z: number): void {
    this.faceTarget = { x, z };
  }

  stop(): void {
    this.route = null;
    this.arrived = true;
    this.faceTarget = null;
    this.move.set(0, 0);
    this.run = false;
  }

  get done(): boolean {
    return this.arrived;
  }

  /** Remaining distance to the end of the route (0 when not walking). */
  get remaining(): number {
    return this.route ? Math.max(0, this.route.length - this.s) : 0;
  }

  /** Call once per frame before the controller update. */
  steer(dt: number): { move: Vector2; run: boolean } {
    this.move.set(0, 0);
    const c = this.c;
    if (this.paused) return this;
    const r = this.route;
    if (r && !this.arrived) {
      this.s = r.project(c.position.x, c.position.z, Math.max(0, this.s - 1));
      const [ex, ez] = r.end;
      const toEnd = Math.hypot(ex - c.position.x, ez - c.position.z);
      if (toEnd < 0.35 || (r.length - this.s < 0.2 && toEnd < 0.8)) {
        this.arrived = true;
        this.route = null;
        this.run = false;
        return this;
      }
      r.at(this.s + (this.run ? 2.4 : 1.5), look);
      let dx = look.x - c.position.x;
      let dz = look.z - c.position.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) {
        dx = ex - c.position.x;
        dz = ez - c.position.z;
      }
      const l = Math.hypot(dx, dz) || 1;
      // ease off over the last couple of metres so the panda stops on its mark
      const amount = Math.min(1, 0.22 + toEnd / (this.run ? 3.2 : 1.8));
      // world direction → stick input for a camera looking north (yaw 0)
      this.move.set((dx / l) * amount, (-dz / l) * amount);
      // Blocked (a stray collider on the way): after a while, hop a little further along.
      this.stuck = c.speed < 0.25 ? this.stuck + dt : 0;
      if (this.stuck > 2.2) {
        const p = r.at(this.s + 1.2);
        c.teleport(p.x, p.z, c.yaw);
        this.stuck = 0;
      }
    } else if (this.faceTarget) {
      const yaw = Math.atan2(this.faceTarget.x - c.position.x, this.faceTarget.z - c.position.z);
      c.yaw = dampAngle(c.yaw, yaw, 7, dt);
    }
    return this;
  }
}
