import { CatmullRomCurve3, Vector3 } from 'three';
import { damp, dampAngle, easeInOutSine } from '../utils/math';

/** Where the camera is, what it looks at and how wide the lens is (vertical fov, °). */
export interface CameraPose {
  position: Vector3;
  target: Vector3;
  fov: number;
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

type Point = Vector3 | (() => Vector3);

const at = (p: Point): Vector3 => (typeof p === 'function' ? p() : p);
const tmp = new Vector3();

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
  const cam = new CatmullRomCurve3(o.path, false, 'centripetal');
  const lookCurve = Array.isArray(o.look)
    ? new CatmullRomCurve3(o.look, false, 'centripetal')
    : null;
  return {
    pose(t, _dt, out) {
      const u = Math.min(1, t / o.duration);
      const k = o.ease === false ? u : easeInOutSine(u);
      cam.getPointAt(k, out.position);
      if (lookCurve) lookCurve.getPointAt(k, out.target);
      else out.target.copy((o.look as () => Vector3)());
      out.fov = o.fov ?? 45;
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
  o: { fov?: number; lookHeight?: number; drift?: Vector3; stiffness?: number } = {},
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
      out.fov = o.fov ?? 42;
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
