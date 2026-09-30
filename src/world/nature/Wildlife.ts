import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type Scene,
} from 'three';
import { globalUniforms } from '../../render/uniforms';
import { Random } from '../../utils/random';
import { lakeSdf } from '../heightfield';
import { WATER_LEVEL } from '../layout';
import type { Terrain } from '../Terrain';

const m4 = new Matrix4();
const q = new Quaternion();
const qTilt = new Quaternion();
const v3 = new Vector3();
const s3 = new Vector3();
const Y = new Vector3(0, 1, 0);
const X = new Vector3(1, 0, 0);
/** the flock leans into its turn */
const BANK = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -0.18);

/** Top view of a butterfly (white with dark borders and veins; tinted per instance). */
function butterflyTexture(): CanvasTexture {
  const w = 128;
  const h = 64;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const wing = (mirror: number) => {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(mirror, 1);
    // forewing
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(2, -2);
    ctx.bezierCurveTo(18, -30, 50, -32, 60, -24);
    ctx.bezierCurveTo(58, -10, 40, 0, 4, 2);
    ctx.fill();
    // hindwing
    ctx.beginPath();
    ctx.moveTo(3, 2);
    ctx.bezierCurveTo(30, 2, 44, 16, 36, 26);
    ctx.bezierCurveTo(22, 32, 8, 22, 2, 6);
    ctx.fill();
    // dark borders with pale spots
    ctx.strokeStyle = '#1d1712';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(18, -24);
    ctx.bezierCurveTo(38, -32, 54, -30, 60, -24);
    ctx.bezierCurveTo(58, -12, 44, -2, 30, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(30, 6);
    ctx.bezierCurveTo(44, 16, 36, 26, 36, 26);
    ctx.bezierCurveTo(24, 31, 12, 24, 6, 12);
    ctx.stroke();
    ctx.fillStyle = '#f4efe0';
    for (const [x, y] of [
      [44, -26],
      [52, -22],
      [55, -15],
      [36, 22],
      [28, 25],
    ])
      ctx.fillRect(x! - 1.2, y! - 1.2, 2.4, 2.4);
    // veins
    ctx.strokeStyle = 'rgba(40, 28, 20, 0.55)';
    ctx.lineWidth = 1;
    for (const [x, y] of [
      [50, -24],
      [44, -12],
      [30, 16],
      [22, 22],
    ]) {
      ctx.beginPath();
      ctx.moveTo(3, 0);
      ctx.lineTo(x!, y!);
      ctx.stroke();
    }
    ctx.restore();
  };
  wing(1);
  wing(-1);
  // body
  ctx.fillStyle = '#231b14';
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2 + 2, 2.2, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Two wing halves hinged along the body (local z), flapped in the vertex shader. */
function hingedWings(span: number, length: number): BufferGeometry {
  const hw = span / 2;
  const hl = length / 2;
  const pos = [
    -hw,
    0,
    -hl,
    0,
    0,
    -hl,
    0,
    0,
    hl,
    -hw,
    0,
    hl,
    0,
    0,
    -hl,
    hw,
    0,
    -hl,
    hw,
    0,
    hl,
    0,
    0,
    hl,
  ];
  // texture: top of the canvas (v = 1) is the head end (local -z)
  const uv = [0, 1, 0.5, 1, 0.5, 0, 0, 0, 0.5, 1, 1, 1, 1, 0, 0.5, 0];
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute(
    'normal',
    new BufferAttribute(
      new Float32Array(8 * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  g.setIndex([0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6]);
  return g;
}

/** A small bird seen from below: body plus inner and outer wing panels. */
function birdGeometry(): BufferGeometry {
  // x: across the wings, z: along the body (head at -z)
  const pos = [
    // body (a flat diamond)
    0, 0, -0.32, 0.07, 0, 0, 0, 0, 0.3, -0.07, 0, 0,
    // right inner wing
    0.05, 0, -0.1, 0.42, 0, -0.06, 0.42, 0, 0.14, 0.05, 0, 0.1,
    // right outer wing
    0.42, 0, -0.06, 0.85, 0, 0.12, 0.42, 0, 0.14,
    // left inner wing
    -0.05, 0, -0.1, -0.42, 0, -0.06, -0.42, 0, 0.14, -0.05, 0, 0.1,
    // left outer wing
    -0.42, 0, -0.06, -0.85, 0, 0.12, -0.42, 0, 0.14,
    // tail
    -0.08, 0, 0.26, 0.08, 0, 0.26, 0, 0, 0.46,
  ];
  const idx = [
    0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 11, 13, 12, 11, 14, 13, 15, 17, 16, 18, 20, 19,
  ];
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute(
    'normal',
    new BufferAttribute(
      new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  g.setIndex(idx);
  return g;
}

/** Dragonfly: a long thin body and two pairs of glassy wings. */
function dragonflyGeometry(): BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], rgb: number[]) => {
    const i = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    for (let k = 0; k < 4; k++) col.push(...rgb);
    idx.push(i, i + 2, i + 1, i, i + 3, i + 2);
  };
  const body = [0.12, 0.42, 0.52];
  const wing = [0.85, 0.9, 0.95];
  // body: two crossed strips (visible from any side)
  quad([-0.012, 0, -0.07], [0.012, 0, -0.07], [0.006, 0, 0.12], [-0.006, 0, 0.12], body);
  quad([0, -0.012, -0.07], [0, 0.012, -0.07], [0, 0.006, 0.12], [0, -0.006, 0.12], body);
  for (const s of [-1, 1]) {
    quad([0, 0, -0.045], [s * 0.1, 0.004, -0.06], [s * 0.1, 0.004, -0.035], [0, 0, -0.025], wing);
    quad([0, 0, -0.015], [s * 0.09, 0.004, -0.012], [s * 0.09, 0.004, 0.012], [0, 0, 0.0], wing);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setAttribute(
    'normal',
    new BufferAttribute(
      new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  g.setIndex(idx);
  return g;
}

/**
 * Flapping-wing material: vertices away from the body axis (local x = 0) are rotated up
 * and down around it. `inner` limits the hinge (for birds the outer panel bends more).
 */
function flappingMaterial(
  o: { map?: CanvasTexture; color?: string; vertexColors?: boolean; transparent?: boolean },
  flap: string,
): MeshLambertMaterial {
  const mat = new MeshLambertMaterial({
    map: o.map ?? null,
    color: o.color ?? '#ffffff',
    vertexColors: o.vertexColors ?? false,
    side: DoubleSide,
    alphaTest: o.map ? 0.5 : 0,
    transparent: o.transparent ?? false,
    depthWrite: !o.transparent,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = globalUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uTime;\nattribute float aPhase;\nattribute float aBeat;',
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
{
  float x = transformed.x;
  float ax = abs(x);
  float a = 0.0;
  ${flap}
  transformed.x = sign(x) * ax * cos(a);
  transformed.y += ax * sin(a);
}`,
      );
  };
  return mat;
}

interface Butterfly {
  pos: Vector3;
  vel: Vector3;
  home: Vector3;
  seed: number;
  alive: boolean;
  /** seconds since it appeared (it grows in instead of popping up) */
  age: number;
}

interface Dragonfly {
  pos: Vector3;
  target: Vector3;
  hover: number;
  seed: number;
}

const BUTTERFLY_COLORS = ['#f2a33a', '#f6d34a', '#fbf6ea', '#9cc2ec', '#f19bb4', '#e8773a'];

/**
 * Small lives in the valley: butterflies drifting over the meadows around the panda (and
 * fluttering off when it comes close), dragonflies darting and hovering over the lake,
 * and a flock of birds wheeling high above the valley.
 */
export class Wildlife {
  private readonly butterflies: Butterfly[] = [];
  private readonly dragonflies: Dragonfly[] = [];
  private readonly butterflyMesh: InstancedMesh;
  private readonly dragonflyMesh: InstancedMesh;
  private readonly birdMesh: InstancedMesh;
  private readonly rand = new Random(4242);
  private readonly birds: { offset: Vector3; phase: number }[] = [];

  constructor(
    private readonly terrain: Terrain,
    density: number,
  ) {
    const nB = Math.max(4, Math.round(22 * density));
    const nD = Math.max(2, Math.round(7 * density));
    const nBirds = 7;

    // ---- butterflies ----
    const bGeo = hingedWings(0.28, 0.18);
    bGeo.setAttribute(
      'aPhase',
      new InstancedBufferAttribute(
        new Float32Array(nB).map(() => this.rand.float()),
        1,
      ),
    );
    bGeo.setAttribute(
      'aBeat',
      new InstancedBufferAttribute(
        new Float32Array(nB).map(() => this.rand.range(9, 13)),
        1,
      ),
    );
    const bMat = flappingMaterial(
      { map: butterflyTexture() },
      'float f = sin(uTime * aBeat + aPhase * 40.0); a = mix(-0.25, 1.25, f * 0.5 + 0.5);',
    );
    this.butterflyMesh = new InstancedMesh(bGeo, bMat, nB);
    this.butterflyMesh.name = 'butterflies';
    const color = new Color();
    for (let i = 0; i < nB; i++) {
      this.butterflyMesh.setColorAt(i, color.set(BUTTERFLY_COLORS[i % BUTTERFLY_COLORS.length]!));
      this.butterflies.push({
        pos: new Vector3(),
        vel: new Vector3(),
        home: new Vector3(),
        seed: this.rand.range(0, 100),
        alive: false,
        age: 0,
      });
    }
    this.butterflyMesh.frustumCulled = false;

    // ---- dragonflies ----
    const dGeo = dragonflyGeometry();
    dGeo.setAttribute(
      'aPhase',
      new InstancedBufferAttribute(
        new Float32Array(nD).map(() => this.rand.float()),
        1,
      ),
    );
    dGeo.setAttribute('aBeat', new InstancedBufferAttribute(new Float32Array(nD).fill(38), 1));
    const dMat = flappingMaterial(
      { vertexColors: true, transparent: true },
      // wings buzz; the body (|x| < 0.013) stays put
      'a = step(0.013, ax) * sin(uTime * aBeat + aPhase * 40.0) * 0.5;',
    );
    dMat.opacity = 0.85;
    this.dragonflyMesh = new InstancedMesh(dGeo, dMat, nD);
    this.dragonflyMesh.name = 'dragonflies';
    this.dragonflyMesh.frustumCulled = false;
    for (let i = 0; i < nD; i++) {
      const p = this.lakeSpot();
      this.dragonflies.push({
        pos: p.clone(),
        target: p,
        hover: this.rand.range(0, 2),
        seed: this.rand.range(0, 100),
      });
    }

    // ---- birds ----
    const birdGeo = birdGeometry();
    birdGeo.setAttribute(
      'aPhase',
      new InstancedBufferAttribute(
        new Float32Array(nBirds).map(() => this.rand.float()),
        1,
      ),
    );
    birdGeo.setAttribute(
      'aBeat',
      new InstancedBufferAttribute(
        new Float32Array(nBirds).map(() => this.rand.range(6.5, 8)),
        1,
      ),
    );
    const birdMat = flappingMaterial(
      { color: '#2f2b2c' },
      // bursts of flapping between long glides; the outer panel bends further
      `float cycle = fract(uTime * 0.12 + aPhase);
  float flapping = smoothstep(0.0, 0.05, cycle) * (1.0 - smoothstep(0.35, 0.42, cycle));
  float f = sin(uTime * aBeat + aPhase * 30.0);
  a = mix(0.08, f * 0.55, flapping) * (ax > 0.43 ? 1.5 : 1.0);`,
    );
    this.birdMesh = new InstancedMesh(birdGeo, birdMat, nBirds);
    this.birdMesh.name = 'birds';
    this.birdMesh.frustumCulled = false;
    this.birdMesh.castShadow = false;
    for (let i = 0; i < nBirds; i++) {
      // a loose V behind the leader
      const rank = Math.ceil(i / 2);
      const side = i % 2 ? 1 : -1;
      this.birds.push({
        offset: new Vector3(side * rank * 1.5, this.rand.spread(0.4), rank * 1.8),
        phase: this.rand.range(0, 10),
      });
    }
  }

  addTo(scene: Scene): void {
    scene.add(this.butterflyMesh, this.dragonflyMesh, this.birdMesh);
  }

  /** A point over open water near the shore. */
  private lakeSpot(near?: Vector3): Vector3 {
    for (let k = 0; k < 40; k++) {
      const x = near ? near.x + this.rand.spread(4) : this.rand.range(8, 48);
      const z = near ? near.z + this.rand.spread(4) : this.rand.range(-28, 12);
      const sdf = lakeSdf(x, z);
      if (sdf < -0.8 && sdf > -7) return new Vector3(x, WATER_LEVEL + this.rand.range(0.3, 0.9), z);
    }
    return near ? near.clone() : new Vector3(28, WATER_LEVEL + 0.5, -6);
  }

  /** A meadow spot for a butterfly, some distance from the panda. */
  private meadowSpot(player: Vector3, out: Vector3): boolean {
    for (let k = 0; k < 12; k++) {
      const a = this.rand.range(0, Math.PI * 2);
      const r = this.rand.range(6, 22);
      const x = player.x + Math.cos(a) * r;
      const z = player.z + Math.sin(a) * r;
      if (this.terrain.surfaceAt(x, z) !== 'grass') continue;
      if (this.terrain.slopeAt(x, z) > 0.3) continue;
      out.set(x, this.terrain.heightAt(x, z), z);
      return true;
    }
    return false;
  }

  update(dt: number, time: number, player: Vector3): void {
    dt = Math.min(dt, 0.1);
    // ---- butterflies ----
    this.butterflies.forEach((b, i) => {
      const far = Math.hypot(b.pos.x - player.x, b.pos.z - player.z) > 26;
      if (!b.alive || far) {
        b.alive = this.meadowSpot(player, b.home);
        if (!b.alive) {
          m4.makeScale(0, 0, 0);
          this.butterflyMesh.setMatrixAt(i, m4);
          return;
        }
        b.pos.copy(b.home).setY(b.home.y + 0.8);
        b.vel.set(0, 0, 0);
        b.age = 0;
      }
      b.age += dt;
      // wander around home in slow loops, bobbing up and down
      const s = b.seed;
      const tx = b.home.x + Math.sin(time * 0.31 + s) * 2.4 + Math.sin(time * 0.87 + s * 2) * 0.8;
      const tz = b.home.z + Math.cos(time * 0.27 + s * 1.3) * 2.4 + Math.cos(time * 0.73 + s) * 0.8;
      const ground = this.terrain.heightAt(b.pos.x, b.pos.z);
      const ty =
        ground + 0.55 + 0.4 * Math.sin(time * 0.9 + s) + 0.15 * Math.sin(time * 5.3 + s * 3);
      v3.set(tx - b.pos.x, ty - b.pos.y, tz - b.pos.z);
      // flutter away and up from the panda
      const dx = b.pos.x - player.x;
      const dz = b.pos.z - player.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.2) {
        const k = (2.2 - d) * 2.5;
        v3.x += (dx / (d + 1e-3)) * k;
        v3.z += (dz / (d + 1e-3)) * k;
        v3.y += k * 0.8;
        b.home.x += (dx / (d + 1e-3)) * k * dt * 2;
        b.home.z += (dz / (d + 1e-3)) * k * dt * 2;
      }
      const speed = Math.min(1.6, v3.length());
      v3.normalize().multiplyScalar(speed);
      b.vel.lerp(v3, Math.min(1, dt * 2.5));
      b.pos.addScaledVector(b.vel, dt);
      b.pos.y = Math.max(b.pos.y, ground + 0.15);
      // heading along the flight, banking a little, with a jittery flight
      q.setFromAxisAngle(Y, Math.atan2(-b.vel.x, -b.vel.z));
      qTilt.setFromAxisAngle(X, 0.25 + 0.15 * Math.sin(time * 7 + s));
      q.multiply(qTilt);
      m4.compose(b.pos, q, s3.setScalar(Math.min(1, b.age * 1.5)));
      this.butterflyMesh.setMatrixAt(i, m4);
    });
    this.butterflyMesh.instanceMatrix.needsUpdate = true;

    // ---- dragonflies: dart, then hover ----
    this.dragonflies.forEach((f, i) => {
      v3.subVectors(f.target, f.pos);
      const dist = v3.length();
      if (dist > 0.05) {
        f.pos.addScaledVector(v3.normalize(), Math.min(dist, dt * 5.5));
      } else {
        f.hover -= dt;
        if (f.hover <= 0) {
          f.target = this.lakeSpot(f.pos);
          f.hover = this.rand.range(0.6, 2.6);
        }
      }
      const jitter = 0.03 * Math.sin(time * 13 + f.seed);
      const heading = Math.atan2(-(f.target.x - f.pos.x), -(f.target.z - f.pos.z));
      q.setFromAxisAngle(Y, dist > 0.05 ? heading : f.seed);
      v3.copy(f.pos).setY(f.pos.y + jitter);
      m4.compose(v3, q, s3.setScalar(1.6));
      this.dragonflyMesh.setMatrixAt(i, m4);
    });
    this.dragonflyMesh.instanceMatrix.needsUpdate = true;

    // ---- birds: a flock wheeling over the valley ----
    const t = time * 0.045;
    const cx = 8 + Math.cos(t) * 58;
    const cz = -6 + Math.sin(t) * 42;
    const cy = 34 + Math.sin(time * 0.1) * 4;
    const heading = Math.atan2(Math.sin(t) * 58, -Math.cos(t) * 42);
    q.setFromAxisAngle(Y, heading);
    qTilt.copy(q).multiply(BANK);
    this.birds.forEach((bird, i) => {
      v3.copy(bird.offset).applyQuaternion(q);
      v3.x += cx + Math.sin(time * 0.7 + bird.phase) * 0.4;
      v3.y += cy + Math.sin(time * 0.9 + bird.phase) * 0.3;
      v3.z += cz;
      m4.compose(v3, qTilt, s3.setScalar(1.3));
      this.birdMesh.setMatrixAt(i, m4);
    });
    this.birdMesh.instanceMatrix.needsUpdate = true;
  }
}
