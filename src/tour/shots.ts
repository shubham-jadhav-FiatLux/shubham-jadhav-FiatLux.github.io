import { Vector3 } from 'three';
import { clamp01, damp, dampAngle, easeInOutSine } from '../utils/math';
import { BezierPath, cubicBezierEase, PathTiming } from './spline';

/** Where the camera is, what it looks at and how wide the lens is (vertical fov, °). */
export interface CameraPose {
  position: Vector3;
  target: Vector3;
  fov: number;
  /** how close to the ground or water the camera may go (m); default 0.45 */
  clearance?: number;
}

export function createPose(): CameraPose {
  return { position: new Vector3(), target: new Vector3(), fov: 45 };
}

/**
 * One camera setup. `pose` is called every frame with the time since the cut; shots may
 * keep state (smoothing), so a shot object is used for one cut only.
 */
export interface Shot {
  pose(t: number, dt: number, out: CameraPose): void;
}

/** The subject of a shot: the panda (feet position and facing). */
export interface Subject {
  position: Vector3;
  yaw: number;
}

/** A fixed point, or one worked out every frame (the panda, a point ahead of it...). */
export type Target = Vector3 | (() => Vector3);

type Point = Target;

const at = (p: Point): Vector3 => (typeof p === 'function' ? p() : p);
const tmp = new Vector3();
const dirA = new Vector3();
const dirB = new Vector3();

/**
 * Turns unit direction `a` towards unit direction `b` by fraction `k` (into `a`) the way a
 * camera operator would: panning the short way round and tilting, separately, so the
 * horizon stays level and a turn between opposite views never swings through the sky or
 * the ground.
 */
export function panTilt(a: Vector3, b: Vector3, k: number): Vector3 {
  const yawA = Math.atan2(a.x, a.z);
  const yawB = Math.atan2(b.x, b.z);
  const pitchA = Math.asin(Math.min(1, Math.max(-1, a.y)));
  const pitchB = Math.asin(Math.min(1, Math.max(-1, b.y)));
  let turn = yawB - yawA;
  turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
  const yaw = yawA + turn * k;
  const pitch = pitchA + (pitchB - pitchA) * k;
  const flat = Math.cos(pitch);
  return a.set(Math.sin(yaw) * flat, Math.sin(pitch), Math.cos(yaw) * flat);
}

const smoother = (u: number) => {
  const x = clamp01(u);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/** Where the camera looks, by time: hold, or pan from one target to the next. */
export interface LookKey {
  t: number;
  at: Target;
}

/** The lens (vertical fov, °), by time; eased between keys. */
export interface FovKey {
  t: number;
  fov: number;
}

/**
 * Points the camera at `look` from `position` at shot time `t`: one target, or a list of
 * keys panned between smoothly. Pans turn the view (pan and tilt, not a straight slide of
 * the target), so swinging from a nearby panda to far hills stays an even pan.
 */
export function aim(look: Target | LookKey[], t: number, position: Vector3, out: Vector3): void {
  if (!Array.isArray(look)) {
    out.copy(at(look));
    return;
  }
  const keys = look;
  if (t <= keys[0]!.t || keys.length === 1) {
    out.copy(at(keys[0]!.at));
    return;
  }
  const last = keys[keys.length - 1]!;
  if (t >= last.t) {
    out.copy(at(last.at));
    return;
  }
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1]!.t) i++;
  const a = keys[i]!;
  const b = keys[i + 1]!;
  const k = smoother((t - a.t) / Math.max(1e-6, b.t - a.t));
  const pa = at(a.at);
  const pb = at(b.at);
  dirA.subVectors(pa, position);
  dirB.subVectors(pb, position);
  const da = dirA.length();
  const db = dirB.length();
  if (da < 1e-4 || db < 1e-4) {
    out.lerpVectors(pa, pb, k);
    return;
  }
  panTilt(dirA.multiplyScalar(1 / da), dirB.multiplyScalar(1 / db), k);
  out.copy(position).addScaledVector(dirA, da + (db - da) * k);
}

/** The lens at shot time `t`. */
export function lens(fov: number | FovKey[] | undefined, t: number, fallback: number): number {
  if (fov === undefined) return fallback;
  if (typeof fov === 'number') return fov;
  if (t <= fov[0]!.t || fov.length === 1) return fov[0]!.fov;
  const last = fov[fov.length - 1]!;
  if (t >= last.t) return last.fov;
  let i = 0;
  while (i < fov.length - 2 && t > fov[i + 1]!.t) i++;
  const a = fov[i]!;
  const b = fov[i + 1]!;
  return a.fov + (b.fov - a.fov) * smoother((t - a.t) / Math.max(1e-6, b.t - a.t));
}

/**
 * The camera on a smooth Bezier path: a crane, a glide over the water, a sweep around a
 * landmark. The path passes through `path` (handles worked out automatically), or takes
 * explicit Bezier control points (`bezier: true`: P0, C, C, P1, C, C, P2 ...).
 *
 * Timing: give `times` (when the camera passes each point; it eases in at the start,
 * out at the end, and changes speed smoothly in between), or a `duration` with an
 * optional CSS-style `ease` curve (default: a gentle ease-in-out).
 */
export function move(o: {
  path: Vector3[];
  bezier?: boolean;
  times?: number[];
  duration?: number;
  ease?: [number, number, number, number];
  look: Target | LookKey[];
  fov?: number | FovKey[];
  clearance?: number;
}): Shot {
  const curve = o.bezier ? BezierPath.bezier(o.path) : BezierPath.through(o.path);
  let progress: (t: number) => number;
  if (o.times && !o.bezier) {
    if (o.times.length !== o.path.length) throw new Error('one time per path point');
    const timing = new PathTiming(
      o.times.map((t, i) => ({ t, f: curve.knots[i]! / Math.max(1e-6, curve.length) })),
    );
    progress = (t) => timing.fraction(t);
  } else {
    const duration = o.duration ?? o.times?.[o.times.length - 1] ?? 6;
    const ease = cubicBezierEase(...(o.ease ?? [0.45, 0.05, 0.25, 1]));
    progress = (t) => ease(clamp01(t / duration));
  }
  return {
    pose(t, _dt, out) {
      curve.atFraction(progress(t), out.position);
      aim(o.look, t, out.position, out.target);
      out.fov = lens(o.fov, t, 45);
      out.clearance = o.clearance;
    },
  };
}

/**
 * Camera on rails: glides along a smooth curve through `path` over `duration` seconds,
 * looking along a second curve (or at a moving point). Crane, dolly and aerial shots.
 */
export function rail(o: {
  path: Vector3[];
  look: Vector3[] | (() => Vector3);
  duration: number;
  fov?: number;
  /** ease the move in and out (default) or glide at constant speed */
  ease?: boolean;
}): Shot {
  const cam = BezierPath.through(o.path);
  const lookCurve = Array.isArray(o.look) ? BezierPath.through(o.look) : null;
  return {
    pose(t, _dt, out) {
      const u = Math.min(1, t / o.duration);
      const k = o.ease === false ? u : easeInOutSine(u);
      cam.atFraction(k, out.position);
      if (lookCurve) lookCurve.atFraction(k, out.target);
      else out.target.copy((o.look as () => Vector3)());
      out.fov = o.fov ?? 45;
      out.clearance = undefined;
    },
  };
}

/**
 * A camera travelling with the subject: `angle` is measured from straight behind it
 * (0 = behind, π/2 = its left side, π = in front), `distance` along the ground and
 * `height` above its feet. Position and heading are smoothed so turns feel like a
 * camera operator following, not a camera nailed to the panda.
 */
export function track(
  subject: () => Subject,
  o: {
    distance: number;
    height: number;
    angle: number;
    lookHeight?: number;
    /** look a little ahead of the subject along its heading (m) */
    lookAhead?: number;
    fov?: number;
    /** how quickly the camera catches up (1/s) */
    stiffness?: number;
    /** swing the angle slowly over the shot (rad/s) */
    swing?: number;
    clearance?: number;
  },
): Shot {
  const pos = new Vector3();
  const look = new Vector3();
  let yaw = 0;
  let started = false;
  return {
    pose(t, dt, out) {
      const s = subject();
      if (!started) yaw = s.yaw;
      yaw = dampAngle(yaw, s.yaw, 2.2, dt);
      const a = yaw + o.angle + (o.swing ?? 0) * t;
      tmp.set(
        s.position.x - Math.sin(a) * o.distance,
        s.position.y + o.height,
        s.position.z - Math.cos(a) * o.distance,
      );
      const ahead = o.lookAhead ?? 0;
      const lx = s.position.x + Math.sin(yaw) * ahead;
      const lz = s.position.z + Math.cos(yaw) * ahead;
      const ly = s.position.y + (o.lookHeight ?? 1);
      const k = o.stiffness ?? 3.5;
      if (!started) {
        pos.copy(tmp);
        look.set(lx, ly, lz);
        started = true;
      } else {
        pos.x = damp(pos.x, tmp.x, k, dt);
        pos.y = damp(pos.y, tmp.y, k, dt);
        pos.z = damp(pos.z, tmp.z, k, dt);
        look.x = damp(look.x, lx, k * 1.6, dt);
        look.y = damp(look.y, ly, k * 1.6, dt);
        look.z = damp(look.z, lz, k * 1.6, dt);
      }
      out.position.copy(pos);
      out.target.copy(look);
      out.fov = o.fov ?? 42;
      out.clearance = o.clearance;
    },
  };
}

/** Circles slowly around a point (or the subject), always looking at it. */
export function orbit(
  center: Point,
  o: {
    radius: number;
    height: number;
    /** start angle around the centre (0 = south of it, +z) */
    angle: number;
    /** rad/s, positive = counter-clockwise seen from above */
    speed: number;
    lookHeight?: number;
    fov?: number;
    /** radius change per second (slow push in / pull out) */
    push?: number;
  },
): Shot {
  const c = new Vector3();
  let started = false;
  return {
    pose(t, dt, out) {
      const p = at(center);
      if (!started) {
        c.copy(p);
        started = true;
      } else {
        c.x = damp(c.x, p.x, 3, dt);
        c.y = damp(c.y, p.y, 3, dt);
        c.z = damp(c.z, p.z, 3, dt);
      }
      const a = o.angle + o.speed * t;
      const r = Math.max(1.5, o.radius + (o.push ?? 0) * t);
      out.position.set(c.x + Math.sin(a) * r, c.y + o.height, c.z + Math.cos(a) * r);
      out.target.set(c.x, c.y + (o.lookHeight ?? 1), c.z);
      out.fov = o.fov ?? 45;
    },
  };
}

/**
 * A fixed camera panning to keep the subject in frame, like a camera on a tripod;
 * `drift` moves the tripod slowly (a gentle dolly) in metres per second.
 */
export function tripod(
  position: Vector3,
  look: Point,
  o: {
    fov?: number | FovKey[];
    lookHeight?: number;
    drift?: Vector3;
    stiffness?: number;
    clearance?: number;
  } = {},
): Shot {
  const target = new Vector3();
  let started = false;
  return {
    pose(t, dt, out) {
      const p = at(look);
      const ly = p.y + (o.lookHeight ?? 1);
      if (!started) {
        target.set(p.x, ly, p.z);
        started = true;
      } else {
        const k = o.stiffness ?? 4;
        target.x = damp(target.x, p.x, k, dt);
        target.y = damp(target.y, ly, k, dt);
        target.z = damp(target.z, p.z, k, dt);
      }
      out.position.copy(position);
      if (o.drift) out.position.addScaledVector(o.drift, t);
      out.target.copy(target);
      out.fov = lens(o.fov, t, 42);
      out.clearance = o.clearance;
    },
  };
}

/**
 * A camera whose place is worked out from the subject every frame (for example travelling
 * alongside the zig-zag bridge at a fixed distance), smoothed, and looking at the subject.
 */
export function dolly(
  subject: () => Subject,
  place: (s: Subject, out: Vector3) => void,
  o: { lookHeight?: number; fov?: number; stiffness?: number } = {},
): Shot {
  const pos = new Vector3();
  const look = new Vector3();
  let started = false;
  return {
    pose(_t, dt, out) {
      const s = subject();
      place(s, tmp);
      const ly = s.position.y + (o.lookHeight ?? 1);
      if (!started) {
        pos.copy(tmp);
        look.set(s.position.x, ly, s.position.z);
        started = true;
      } else {
        const k = o.stiffness ?? 2.5;
        pos.x = damp(pos.x, tmp.x, k, dt);
        pos.y = damp(pos.y, tmp.y, k, dt);
        pos.z = damp(pos.z, tmp.z, k, dt);
        look.x = damp(look.x, s.position.x, k * 2, dt);
        look.y = damp(look.y, ly, k * 2, dt);
        look.z = damp(look.z, s.position.z, k * 2, dt);
      }
      out.position.copy(pos);
      out.target.copy(look);
      out.fov = o.fov ?? 42;
    },
  };
}
