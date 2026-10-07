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
  pose(sj_t: number, sj_dt: number, sj_out: CameraPose): void;
}

/** The subject of a shot: the panda (feet position and facing). */
export interface Subject {
  position: Vector3;
  yaw: number;
}

/** A fixed point, or one worked out every frame (the panda, a point ahead of it...). */
export type Target = Vector3 | (() => Vector3);

type Point = Target;

const sj_at = (sj_p: Point): Vector3 => (typeof sj_p === 'function' ? sj_p() : sj_p);
const sj_tmp = new Vector3();
const sj_dirA = new Vector3();
const sj_dirB = new Vector3();

/**
 * Turns unit direction `sj_a` towards unit direction `sj_b` by fraction `sj_k` (into `sj_a`) the way a
 * camera operator would: panning the short way round and tilting, separately, so the
 * horizon stays level and a turn between opposite views never swings through the sky or
 * the ground.
 */
export function panTilt(sj_a: Vector3, sj_b: Vector3, sj_k: number): Vector3 {
  const sj_yawA = Math.atan2(sj_a.x, sj_a.z);
  const sj_yawB = Math.atan2(sj_b.x, sj_b.z);
  const sj_pitchA = Math.asin(Math.min(1, Math.max(-1, sj_a.y)));
  const sj_pitchB = Math.asin(Math.min(1, Math.max(-1, sj_b.y)));
  let sj_turn = sj_yawB - sj_yawA;
  sj_turn -= Math.round(sj_turn / (Math.PI * 2)) * Math.PI * 2;
  const sj_yaw = sj_yawA + sj_turn * sj_k;
  const sj_pitch = sj_pitchA + (sj_pitchB - sj_pitchA) * sj_k;
  const sj_flat = Math.cos(sj_pitch);
  return sj_a.set(Math.sin(sj_yaw) * sj_flat, Math.sin(sj_pitch), Math.cos(sj_yaw) * sj_flat);
}

const sj_smoother = (sj_u: number) => {
  const sj_x = clamp01(sj_u);
  return sj_x * sj_x * sj_x * (sj_x * (sj_x * 6 - 15) + 10);
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
export function aim(
  sj_look: Target | LookKey[],
  sj_t: number,
  sj_position: Vector3,
  sj_out: Vector3,
): void {
  if (!Array.isArray(sj_look)) {
    sj_out.copy(sj_at(sj_look));
    return;
  }
  const sj_keys = sj_look;
  if (sj_t <= sj_keys[0]!.t || sj_keys.length === 1) {
    sj_out.copy(sj_at(sj_keys[0]!.at));
    return;
  }
  const sj_last = sj_keys[sj_keys.length - 1]!;
  if (sj_t >= sj_last.t) {
    sj_out.copy(sj_at(sj_last.at));
    return;
  }
  let sj_i = 0;
  while (sj_i < sj_keys.length - 2 && sj_t > sj_keys[sj_i + 1]!.t) sj_i++;
  const sj_a = sj_keys[sj_i]!;
  const sj_b = sj_keys[sj_i + 1]!;
  const sj_k = sj_smoother((sj_t - sj_a.t) / Math.max(1e-6, sj_b.t - sj_a.t));
  const sj_pa = sj_at(sj_a.at);
  const sj_pb = sj_at(sj_b.at);
  sj_dirA.subVectors(sj_pa, sj_position);
  sj_dirB.subVectors(sj_pb, sj_position);
  const sj_da = sj_dirA.length();
  const sj_db = sj_dirB.length();
  if (sj_da < 1e-4 || sj_db < 1e-4) {
    sj_out.lerpVectors(sj_pa, sj_pb, sj_k);
    return;
  }
  panTilt(sj_dirA.multiplyScalar(1 / sj_da), sj_dirB.multiplyScalar(1 / sj_db), sj_k);
  sj_out.copy(sj_position).addScaledVector(sj_dirA, sj_da + (sj_db - sj_da) * sj_k);
}

/** The lens at shot time `t`. */
export function lens(
  sj_fov: number | FovKey[] | undefined,
  sj_t: number,
  sj_fallback: number,
): number {
  if (sj_fov === undefined) return sj_fallback;
  if (typeof sj_fov === 'number') return sj_fov;
  if (sj_t <= sj_fov[0]!.t || sj_fov.length === 1) return sj_fov[0]!.fov;
  const sj_last = sj_fov[sj_fov.length - 1]!;
  if (sj_t >= sj_last.t) return sj_last.fov;
  let sj_i = 0;
  while (sj_i < sj_fov.length - 2 && sj_t > sj_fov[sj_i + 1]!.t) sj_i++;
  const sj_a = sj_fov[sj_i]!;
  const sj_b = sj_fov[sj_i + 1]!;
  return (
    sj_a.fov +
    (sj_b.fov - sj_a.fov) * sj_smoother((sj_t - sj_a.t) / Math.max(1e-6, sj_b.t - sj_a.t))
  );
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
export function move(sj_o: {
  path: Vector3[];
  bezier?: boolean;
  times?: number[];
  duration?: number;
  ease?: [number, number, number, number];
  look: Target | LookKey[];
  fov?: number | FovKey[];
  clearance?: number;
}): Shot {
  const sj_curve = sj_o.bezier ? BezierPath.bezier(sj_o.path) : BezierPath.through(sj_o.path);
  let sj_progress: (sj_t: number) => number;
  if (sj_o.times && !sj_o.bezier) {
    if (sj_o.times.length !== sj_o.path.length) throw new Error('one time per path point');
    const sj_timing = new PathTiming(
      sj_o.times.map((sj_t, sj_i) => ({
        t: sj_t,
        f: sj_curve.knots[sj_i]! / Math.max(1e-6, sj_curve.length),
      })),
    );
    sj_progress = (sj_t) => sj_timing.fraction(sj_t);
  } else {
    const sj_duration = sj_o.duration ?? sj_o.times?.[sj_o.times.length - 1] ?? 6;
    const sj_ease = cubicBezierEase(...(sj_o.ease ?? [0.45, 0.05, 0.25, 1]));
    sj_progress = (sj_t) => sj_ease(clamp01(sj_t / sj_duration));
  }
  return {
    pose(sj_t, _sj_dt, sj_out) {
      sj_curve.atFraction(sj_progress(sj_t), sj_out.position);
      aim(sj_o.look, sj_t, sj_out.position, sj_out.target);
      sj_out.fov = lens(sj_o.fov, sj_t, 45);
      sj_out.clearance = sj_o.clearance;
    },
  };
}

/**
 * Camera on rails: glides along a smooth curve through `path` over `duration` seconds,
 * looking along a second curve (or at a moving point). Crane, dolly and aerial shots.
 */
export function rail(sj_o: {
  path: Vector3[];
  look: Vector3[] | (() => Vector3);
  duration: number;
  fov?: number;
  /** ease the move in and out (default) or glide at constant speed */
  ease?: boolean;
}): Shot {
  const sj_cam = BezierPath.through(sj_o.path);
  const sj_lookCurve = Array.isArray(sj_o.look) ? BezierPath.through(sj_o.look) : null;
  return {
    pose(sj_t, _sj_dt, sj_out) {
      const sj_u = Math.min(1, sj_t / sj_o.duration);
      const sj_k = sj_o.ease === false ? sj_u : easeInOutSine(sj_u);
      sj_cam.atFraction(sj_k, sj_out.position);
      if (sj_lookCurve) sj_lookCurve.atFraction(sj_k, sj_out.target);
      else sj_out.target.copy((sj_o.look as () => Vector3)());
      sj_out.fov = sj_o.fov ?? 45;
      sj_out.clearance = undefined;
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
  sj_subject: () => Subject,
  sj_o: {
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
  const sj_pos = new Vector3();
  const sj_look = new Vector3();
  let sj_yaw = 0;
  let sj_started = false;
  return {
    pose(sj_t, sj_dt, sj_out) {
      const sj_s = sj_subject();
      if (!sj_started) sj_yaw = sj_s.yaw;
      sj_yaw = dampAngle(sj_yaw, sj_s.yaw, 2.2, sj_dt);
      const sj_a = sj_yaw + sj_o.angle + (sj_o.swing ?? 0) * sj_t;
      sj_tmp.set(
        sj_s.position.x - Math.sin(sj_a) * sj_o.distance,
        sj_s.position.y + sj_o.height,
        sj_s.position.z - Math.cos(sj_a) * sj_o.distance,
      );
      const sj_ahead = sj_o.lookAhead ?? 0;
      const sj_lx = sj_s.position.x + Math.sin(sj_yaw) * sj_ahead;
      const sj_lz = sj_s.position.z + Math.cos(sj_yaw) * sj_ahead;
      const sj_ly = sj_s.position.y + (sj_o.lookHeight ?? 1);
      const sj_k = sj_o.stiffness ?? 3.5;
      if (!sj_started) {
        sj_pos.copy(sj_tmp);
        sj_look.set(sj_lx, sj_ly, sj_lz);
        sj_started = true;
      } else {
        sj_pos.x = damp(sj_pos.x, sj_tmp.x, sj_k, sj_dt);
        sj_pos.y = damp(sj_pos.y, sj_tmp.y, sj_k, sj_dt);
        sj_pos.z = damp(sj_pos.z, sj_tmp.z, sj_k, sj_dt);
        sj_look.x = damp(sj_look.x, sj_lx, sj_k * 1.6, sj_dt);
        sj_look.y = damp(sj_look.y, sj_ly, sj_k * 1.6, sj_dt);
        sj_look.z = damp(sj_look.z, sj_lz, sj_k * 1.6, sj_dt);
      }
      sj_out.position.copy(sj_pos);
      sj_out.target.copy(sj_look);
      sj_out.fov = sj_o.fov ?? 42;
      sj_out.clearance = sj_o.clearance;
    },
  };
}

/** Circles slowly around a point (or the subject), always looking at it. */
export function orbit(
  sj_center: Point,
  sj_o: {
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
  const sj_c = new Vector3();
  let sj_started = false;
  return {
    pose(sj_t, sj_dt, sj_out) {
      const sj_p = sj_at(sj_center);
      if (!sj_started) {
        sj_c.copy(sj_p);
        sj_started = true;
      } else {
        sj_c.x = damp(sj_c.x, sj_p.x, 3, sj_dt);
        sj_c.y = damp(sj_c.y, sj_p.y, 3, sj_dt);
        sj_c.z = damp(sj_c.z, sj_p.z, 3, sj_dt);
      }
      const sj_a = sj_o.angle + sj_o.speed * sj_t;
      const sj_r = Math.max(1.5, sj_o.radius + (sj_o.push ?? 0) * sj_t);
      sj_out.position.set(
        sj_c.x + Math.sin(sj_a) * sj_r,
        sj_c.y + sj_o.height,
        sj_c.z + Math.cos(sj_a) * sj_r,
      );
      sj_out.target.set(sj_c.x, sj_c.y + (sj_o.lookHeight ?? 1), sj_c.z);
      sj_out.fov = sj_o.fov ?? 45;
    },
  };
}

/**
 * A fixed camera panning to keep the subject in frame, like a camera on a tripod;
 * `drift` moves the tripod slowly (a gentle dolly) in metres per second.
 */
export function tripod(
  sj_position: Vector3,
  sj_look: Point,
  sj_o: {
    fov?: number | FovKey[];
    lookHeight?: number;
    drift?: Vector3;
    stiffness?: number;
    clearance?: number;
  } = {},
): Shot {
  const sj_target = new Vector3();
  let sj_started = false;
  return {
    pose(sj_t, sj_dt, sj_out) {
      const sj_p = sj_at(sj_look);
      const sj_ly = sj_p.y + (sj_o.lookHeight ?? 1);
      if (!sj_started) {
        sj_target.set(sj_p.x, sj_ly, sj_p.z);
        sj_started = true;
      } else {
        const sj_k = sj_o.stiffness ?? 4;
        sj_target.x = damp(sj_target.x, sj_p.x, sj_k, sj_dt);
        sj_target.y = damp(sj_target.y, sj_ly, sj_k, sj_dt);
        sj_target.z = damp(sj_target.z, sj_p.z, sj_k, sj_dt);
      }
      sj_out.position.copy(sj_position);
      if (sj_o.drift) sj_out.position.addScaledVector(sj_o.drift, sj_t);
      sj_out.target.copy(sj_target);
      sj_out.fov = lens(sj_o.fov, sj_t, 42);
      sj_out.clearance = sj_o.clearance;
    },
  };
}

/**
 * A camera whose place is worked out from the subject every frame (for example travelling
 * alongside the zig-zag bridge at a fixed distance), smoothed, and looking at the subject.
 */
export function dolly(
  sj_subject: () => Subject,
  sj_place: (sj_s: Subject, sj_out: Vector3) => void,
  sj_o: { lookHeight?: number; fov?: number; stiffness?: number } = {},
): Shot {
  const sj_pos = new Vector3();
  const sj_look = new Vector3();
  let sj_started = false;
  return {
    pose(_sj_t, sj_dt, sj_out) {
      const sj_s = sj_subject();
      sj_place(sj_s, sj_tmp);
      const sj_ly = sj_s.position.y + (sj_o.lookHeight ?? 1);
      if (!sj_started) {
        sj_pos.copy(sj_tmp);
        sj_look.set(sj_s.position.x, sj_ly, sj_s.position.z);
        sj_started = true;
      } else {
        const sj_k = sj_o.stiffness ?? 2.5;
        sj_pos.x = damp(sj_pos.x, sj_tmp.x, sj_k, sj_dt);
        sj_pos.y = damp(sj_pos.y, sj_tmp.y, sj_k, sj_dt);
        sj_pos.z = damp(sj_pos.z, sj_tmp.z, sj_k, sj_dt);
        sj_look.x = damp(sj_look.x, sj_s.position.x, sj_k * 2, sj_dt);
        sj_look.y = damp(sj_look.y, sj_ly, sj_k * 2, sj_dt);
        sj_look.z = damp(sj_look.z, sj_s.position.z, sj_k * 2, sj_dt);
      }
      sj_out.position.copy(sj_pos);
      sj_out.target.copy(sj_look);
      sj_out.fov = sj_o.fov ?? 42;
    },
  };
}
