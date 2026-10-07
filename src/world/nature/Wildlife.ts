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
import { sj_globalUniforms } from '../../render/uniforms';
import { Random } from '../../utils/random';
import { lakeSdf } from '../heightfield';
import { sj_WATER_LEVEL } from '../layout';
import type { Terrain } from '../Terrain';

const sj_m4 = new Matrix4();
const sj_q = new Quaternion();
const sj_qTilt = new Quaternion();
const sj_v3 = new Vector3();
const sj_s3 = new Vector3();
const sj_Y = new Vector3(0, 1, 0);
const sj_X = new Vector3(1, 0, 0);
/** the flock leans into its turn */
const sj_BANK = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -0.18);

/** Top view of a butterfly (white with dark borders and veins; tinted per instance). */
function butterflyTexture(): CanvasTexture {
  const sj_w = 128;
  const sj_h = 64;
  const sj_c = document.createElement('canvas');
  sj_c.width = sj_w;
  sj_c.height = sj_h;
  const sj_ctx = sj_c.getContext('2d')!;
  const sj_wing = (sj_mirror: number) => {
    sj_ctx.save();
    sj_ctx.translate(sj_w / 2, sj_h / 2);
    sj_ctx.scale(sj_mirror, 1);
    // forewing
    sj_ctx.fillStyle = '#ffffff';
    sj_ctx.beginPath();
    sj_ctx.moveTo(2, -2);
    sj_ctx.bezierCurveTo(18, -30, 50, -32, 60, -24);
    sj_ctx.bezierCurveTo(58, -10, 40, 0, 4, 2);
    sj_ctx.fill();
    // hindwing
    sj_ctx.beginPath();
    sj_ctx.moveTo(3, 2);
    sj_ctx.bezierCurveTo(30, 2, 44, 16, 36, 26);
    sj_ctx.bezierCurveTo(22, 32, 8, 22, 2, 6);
    sj_ctx.fill();
    // dark borders with pale spots
    sj_ctx.strokeStyle = '#1d1712';
    sj_ctx.lineWidth = 5;
    sj_ctx.beginPath();
    sj_ctx.moveTo(18, -24);
    sj_ctx.bezierCurveTo(38, -32, 54, -30, 60, -24);
    sj_ctx.bezierCurveTo(58, -12, 44, -2, 30, 0);
    sj_ctx.stroke();
    sj_ctx.beginPath();
    sj_ctx.moveTo(30, 6);
    sj_ctx.bezierCurveTo(44, 16, 36, 26, 36, 26);
    sj_ctx.bezierCurveTo(24, 31, 12, 24, 6, 12);
    sj_ctx.stroke();
    sj_ctx.fillStyle = '#f4efe0';
    for (const [sj_x, sj_y] of [
      [44, -26],
      [52, -22],
      [55, -15],
      [36, 22],
      [28, 25],
    ])
      sj_ctx.fillRect(sj_x! - 1.2, sj_y! - 1.2, 2.4, 2.4);
    // veins
    sj_ctx.strokeStyle = 'rgba(40, 28, 20, 0.55)';
    sj_ctx.lineWidth = 1;
    for (const [sj_x, sj_y] of [
      [50, -24],
      [44, -12],
      [30, 16],
      [22, 22],
    ]) {
      sj_ctx.beginPath();
      sj_ctx.moveTo(3, 0);
      sj_ctx.lineTo(sj_x!, sj_y!);
      sj_ctx.stroke();
    }
    sj_ctx.restore();
  };
  sj_wing(1);
  sj_wing(-1);
  // body
  sj_ctx.fillStyle = '#231b14';
  sj_ctx.beginPath();
  sj_ctx.ellipse(sj_w / 2, sj_h / 2 + 2, 2.2, 14, 0, 0, Math.PI * 2);
  sj_ctx.fill();
  const sj_t = new CanvasTexture(sj_c);
  sj_t.colorSpace = SRGBColorSpace;
  sj_t.needsUpdate = true;
  return sj_t;
}

/** Two wing halves hinged along the body (local z), flapped in the vertex shader. */
function hingedWings(sj_span: number, sj_length: number): BufferGeometry {
  const sj_hw = sj_span / 2;
  const sj_hl = sj_length / 2;
  const sj_pos = [
    -sj_hw,
    0,
    -sj_hl,
    0,
    0,
    -sj_hl,
    0,
    0,
    sj_hl,
    -sj_hw,
    0,
    sj_hl,
    0,
    0,
    -sj_hl,
    sj_hw,
    0,
    -sj_hl,
    sj_hw,
    0,
    sj_hl,
    0,
    0,
    sj_hl,
  ];
  // texture: top of the canvas (v = 1) is the head end (local -z)
  const sj_uv = [0, 1, 0.5, 1, 0.5, 0, 0, 0, 0.5, 1, 1, 1, 1, 0, 0.5, 0];
  const sj_g = new BufferGeometry();
  sj_g.setAttribute('position', new BufferAttribute(new Float32Array(sj_pos), 3));
  sj_g.setAttribute('uv', new BufferAttribute(new Float32Array(sj_uv), 2));
  sj_g.setAttribute(
    'normal',
    new BufferAttribute(
      new Float32Array(8 * 3).map((_sj, sj_i) => (sj_i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  sj_g.setIndex([0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6]);
  return sj_g;
}

/** A small bird seen from below: body plus inner and outer wing panels. */
function birdGeometry(): BufferGeometry {
  // x: across the wings, z: along the body (head at -z)
  const sj_pos = [
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
  const sj_idx = [
    0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 11, 13, 12, 11, 14, 13, 15, 17, 16, 18, 20, 19,
  ];
  const sj_g = new BufferGeometry();
  sj_g.setAttribute('position', new BufferAttribute(new Float32Array(sj_pos), 3));
  sj_g.setAttribute(
    'normal',
    new BufferAttribute(
      new Float32Array(sj_pos.length).map((_sj, sj_i) => (sj_i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  sj_g.setIndex(sj_idx);
  return sj_g;
}

/** Dragonfly: a long thin body and two pairs of glassy wings. */
function dragonflyGeometry(): BufferGeometry {
  const sj_pos: number[] = [];
  const sj_col: number[] = [];
  const sj_idx: number[] = [];
  const sj_quad = (
    sj_a: number[],
    sj_b: number[],
    sj_c: number[],
    sj_d: number[],
    sj_rgb: number[],
  ) => {
    const sj_i = sj_pos.length / 3;
    sj_pos.push(...sj_a, ...sj_b, ...sj_c, ...sj_d);
    for (let sj_k = 0; sj_k < 4; sj_k++) sj_col.push(...sj_rgb);
    sj_idx.push(sj_i, sj_i + 2, sj_i + 1, sj_i, sj_i + 3, sj_i + 2);
  };
  const sj_body = [0.12, 0.42, 0.52];
  const sj_wing = [0.85, 0.9, 0.95];
  // body: two crossed strips (visible from any side)
  sj_quad([-0.012, 0, -0.07], [0.012, 0, -0.07], [0.006, 0, 0.12], [-0.006, 0, 0.12], sj_body);
  sj_quad([0, -0.012, -0.07], [0, 0.012, -0.07], [0, 0.006, 0.12], [0, -0.006, 0.12], sj_body);
  for (const sj_s of [-1, 1]) {
    sj_quad(
      [0, 0, -0.045],
      [sj_s * 0.1, 0.004, -0.06],
      [sj_s * 0.1, 0.004, -0.035],
      [0, 0, -0.025],
      sj_wing,
    );
    sj_quad(
      [0, 0, -0.015],
      [sj_s * 0.09, 0.004, -0.012],
      [sj_s * 0.09, 0.004, 0.012],
      [0, 0, 0.0],
      sj_wing,
    );
  }
  const sj_g = new BufferGeometry();
  sj_g.setAttribute('position', new BufferAttribute(new Float32Array(sj_pos), 3));
  sj_g.setAttribute('color', new BufferAttribute(new Float32Array(sj_col), 3));
  sj_g.setAttribute(
    'normal',
    new BufferAttribute(
      new Float32Array(sj_pos.length).map((_sj, sj_i) => (sj_i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  sj_g.setIndex(sj_idx);
  return sj_g;
}

/**
 * Flapping-wing material: vertices away from the body axis (local x = 0) are rotated up
 * and down around it. `inner` limits the hinge (for birds the outer panel bends more).
 */
function flappingMaterial(
  sj_o: { map?: CanvasTexture; color?: string; vertexColors?: boolean; transparent?: boolean },
  sj_flap: string,
): MeshLambertMaterial {
  const sj_mat = new MeshLambertMaterial({
    map: sj_o.map ?? null,
    color: sj_o.color ?? '#ffffff',
    vertexColors: sj_o.vertexColors ?? false,
    side: DoubleSide,
    alphaTest: sj_o.map ? 0.5 : 0,
    transparent: sj_o.transparent ?? false,
    depthWrite: !sj_o.transparent,
  });
  // each animal injects its own wing motion, so each needs its own program
  sj_mat.customProgramCacheKey = () => `flap:${sj_flap}`;
  sj_mat.onBeforeCompile = (sj_shader) => {
    sj_shader.uniforms.uTime = sj_globalUniforms.uTime;
    sj_shader.vertexShader = sj_shader.vertexShader
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
  ${sj_flap}
  transformed.x = sign(x) * ax * cos(a);
  transformed.y += ax * sin(a);
}`,
      );
  };
  return sj_mat;
}

interface Butterfly {
  pos: Vector3;
  vel: Vector3;
  home: Vector3;
  seed: number;
  alive: boolean;
  /** seconds since it appeared (it grows in instead of popping up) */
  age: number;
  /** seconds it stays where it was gathered, however far the panda is */
  pinned: number;
}

interface Dragonfly {
  pos: Vector3;
  target: Vector3;
  hover: number;
  seed: number;
}

const sj_BUTTERFLY_COLORS = ['#f2a33a', '#f6d34a', '#fbf6ea', '#9cc2ec', '#f19bb4', '#e8773a'];

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
    sj_density: number,
  ) {
    const sj_nB = Math.max(4, Math.round(22 * sj_density));
    const sj_nD = Math.max(2, Math.round(7 * sj_density));
    const sj_nBirds = 7;

    // ---- butterflies ----
    const sj_bGeo = hingedWings(0.28, 0.18);
    sj_bGeo.setAttribute(
      'aPhase',
      new InstancedBufferAttribute(
        new Float32Array(sj_nB).map(() => this.rand.float()),
        1,
      ),
    );
    sj_bGeo.setAttribute(
      'aBeat',
      new InstancedBufferAttribute(
        new Float32Array(sj_nB).map(() => this.rand.range(9, 13)),
        1,
      ),
    );
    const sj_bMat = flappingMaterial(
      { map: butterflyTexture() },
      'float f = sin(uTime * aBeat + aPhase * 40.0); a = mix(-0.25, 1.25, f * 0.5 + 0.5);',
    );
    this.butterflyMesh = new InstancedMesh(sj_bGeo, sj_bMat, sj_nB);
    this.butterflyMesh.name = 'butterflies';
    const sj_color = new Color();
    for (let sj_i = 0; sj_i < sj_nB; sj_i++) {
      this.butterflyMesh.setColorAt(
        sj_i,
        sj_color.set(sj_BUTTERFLY_COLORS[sj_i % sj_BUTTERFLY_COLORS.length]!),
      );
      this.butterflies.push({
        pos: new Vector3(),
        vel: new Vector3(),
        home: new Vector3(),
        seed: this.rand.range(0, 100),
        alive: false,
        age: 0,
        pinned: 0,
      });
    }
    this.butterflyMesh.frustumCulled = false;

    // ---- dragonflies ----
    const sj_dGeo = dragonflyGeometry();
    sj_dGeo.setAttribute(
      'aPhase',
      new InstancedBufferAttribute(
        new Float32Array(sj_nD).map(() => this.rand.float()),
        1,
      ),
    );
    sj_dGeo.setAttribute(
      'aBeat',
      new InstancedBufferAttribute(new Float32Array(sj_nD).fill(38), 1),
    );
    const sj_dMat = flappingMaterial(
      { vertexColors: true, transparent: true },
      // wings buzz; the body (|x| < 0.013) stays put
      'a = step(0.013, ax) * sin(uTime * aBeat + aPhase * 40.0) * 0.5;',
    );
    sj_dMat.opacity = 0.85;
    this.dragonflyMesh = new InstancedMesh(sj_dGeo, sj_dMat, sj_nD);
    this.dragonflyMesh.name = 'dragonflies';
    this.dragonflyMesh.frustumCulled = false;
    for (let sj_i = 0; sj_i < sj_nD; sj_i++) {
      const sj_p = this.lakeSpot();
      this.dragonflies.push({
        pos: sj_p.clone(),
        target: sj_p,
        hover: this.rand.range(0, 2),
        seed: this.rand.range(0, 100),
      });
    }

    // ---- birds ----
    const sj_birdGeo = birdGeometry();
    sj_birdGeo.setAttribute(
      'aPhase',
      new InstancedBufferAttribute(
        new Float32Array(sj_nBirds).map(() => this.rand.float()),
        1,
      ),
    );
    sj_birdGeo.setAttribute(
      'aBeat',
      new InstancedBufferAttribute(
        new Float32Array(sj_nBirds).map(() => this.rand.range(6.5, 8)),
        1,
      ),
    );
    const sj_birdMat = flappingMaterial(
      { color: '#2f2b2c' },
      // bursts of flapping between long glides; the outer panel bends further
      `float cycle = fract(uTime * 0.12 + aPhase);
  float flapping = smoothstep(0.0, 0.05, cycle) * (1.0 - smoothstep(0.35, 0.42, cycle));
  float f = sin(uTime * aBeat + aPhase * 30.0);
  a = mix(0.08, f * 0.55, flapping) * (ax > 0.43 ? 1.5 : 1.0);`,
    );
    this.birdMesh = new InstancedMesh(sj_birdGeo, sj_birdMat, sj_nBirds);
    this.birdMesh.name = 'birds';
    this.birdMesh.frustumCulled = false;
    this.birdMesh.castShadow = false;
    for (let sj_i = 0; sj_i < sj_nBirds; sj_i++) {
      // a loose V behind the leader
      const sj_rank = Math.ceil(sj_i / 2);
      const sj_side = sj_i % 2 ? 1 : -1;
      this.birds.push({
        offset: new Vector3(sj_side * sj_rank * 1.5, this.rand.spread(0.4), sj_rank * 1.8),
        phase: this.rand.range(0, 10),
      });
    }
  }

  addTo(sj_scene: Scene): void {
    sj_scene.add(this.butterflyMesh, this.dragonflyMesh, this.birdMesh);
  }

  /** A point over open water near the shore. */
  private lakeSpot(sj_near?: Vector3): Vector3 {
    for (let sj_k = 0; sj_k < 40; sj_k++) {
      const sj_x = sj_near ? sj_near.x + this.rand.spread(4) : this.rand.range(8, 48);
      const sj_z = sj_near ? sj_near.z + this.rand.spread(4) : this.rand.range(-28, 12);
      const sj_sdf = lakeSdf(sj_x, sj_z);
      if (sj_sdf < -0.8 && sj_sdf > -7)
        return new Vector3(sj_x, sj_WATER_LEVEL + this.rand.range(0.3, 0.9), sj_z);
    }
    return sj_near ? sj_near.clone() : new Vector3(28, sj_WATER_LEVEL + 0.5, -6);
  }

  /**
   * Gathers `sj_count` butterflies over the grass around (x, z), for a shot in the tour.
   * They stay for `sj_seconds` wherever the panda is, then live as usual: wandering, and
   * fluttering off when the panda comes close.
   */
  gather(sj_x: number, sj_z: number, sj_count: number, sj_radius = 3, sj_seconds = 40): void {
    let sj_placed = 0;
    for (const sj_b of this.butterflies) {
      if (sj_placed >= sj_count) break;
      if (sj_b.pinned > 0) continue; // already gathered somewhere else
      for (let sj_k = 0; sj_k < 12; sj_k++) {
        const sj_a = this.rand.range(0, Math.PI * 2);
        const sj_r = this.rand.range(0.4, sj_radius);
        const sj_hx = sj_x + Math.cos(sj_a) * sj_r;
        const sj_hz = sj_z + Math.sin(sj_a) * sj_r;
        if (this.terrain.surfaceAt(sj_hx, sj_hz) !== 'grass') continue;
        sj_b.home.set(sj_hx, this.terrain.heightAt(sj_hx, sj_hz), sj_hz);
        sj_b.pos.copy(sj_b.home).setY(sj_b.home.y + this.rand.range(0.4, 1.1));
        sj_b.vel.set(0, 0, 0);
        sj_b.alive = true;
        sj_b.age = 1;
        sj_b.pinned = sj_seconds;
        sj_placed++;
        break;
      }
    }
  }

  /** Lets every gathered butterfly go back to following the panda around. */
  release(): void {
    for (const sj_b of this.butterflies) sj_b.pinned = 0;
  }

  /** A meadow spot for a butterfly, some distance from the panda. */
  private meadowSpot(sj_player: Vector3, sj_out: Vector3): boolean {
    for (let sj_k = 0; sj_k < 12; sj_k++) {
      const sj_a = this.rand.range(0, Math.PI * 2);
      const sj_r = this.rand.range(6, 22);
      const sj_x = sj_player.x + Math.cos(sj_a) * sj_r;
      const sj_z = sj_player.z + Math.sin(sj_a) * sj_r;
      if (this.terrain.surfaceAt(sj_x, sj_z) !== 'grass') continue;
      if (this.terrain.slopeAt(sj_x, sj_z) > 0.3) continue;
      sj_out.set(sj_x, this.terrain.heightAt(sj_x, sj_z), sj_z);
      return true;
    }
    return false;
  }

  update(sj_dt: number, sj_time: number, sj_player: Vector3): void {
    sj_dt = Math.min(sj_dt, 0.1);
    // ---- butterflies ----
    this.butterflies.forEach((sj_b, sj_i) => {
      sj_b.pinned = Math.max(0, sj_b.pinned - sj_dt);
      const sj_far =
        sj_b.pinned <= 0 && Math.hypot(sj_b.pos.x - sj_player.x, sj_b.pos.z - sj_player.z) > 26;
      if (!sj_b.alive || sj_far) {
        sj_b.alive = this.meadowSpot(sj_player, sj_b.home);
        if (!sj_b.alive) {
          sj_m4.makeScale(0, 0, 0);
          this.butterflyMesh.setMatrixAt(sj_i, sj_m4);
          return;
        }
        sj_b.pos.copy(sj_b.home).setY(sj_b.home.y + 0.8);
        sj_b.vel.set(0, 0, 0);
        sj_b.age = 0;
      }
      sj_b.age += sj_dt;
      // wander around home in slow loops, bobbing up and down
      const sj_s = sj_b.seed;
      const sj_tx =
        sj_b.home.x +
        Math.sin(sj_time * 0.31 + sj_s) * 2.4 +
        Math.sin(sj_time * 0.87 + sj_s * 2) * 0.8;
      const sj_tz =
        sj_b.home.z +
        Math.cos(sj_time * 0.27 + sj_s * 1.3) * 2.4 +
        Math.cos(sj_time * 0.73 + sj_s) * 0.8;
      const sj_ground = this.terrain.heightAt(sj_b.pos.x, sj_b.pos.z);
      const sj_ty =
        sj_ground +
        0.55 +
        0.4 * Math.sin(sj_time * 0.9 + sj_s) +
        0.15 * Math.sin(sj_time * 5.3 + sj_s * 3);
      sj_v3.set(sj_tx - sj_b.pos.x, sj_ty - sj_b.pos.y, sj_tz - sj_b.pos.z);
      // flutter away and up from the panda
      const sj_dx = sj_b.pos.x - sj_player.x;
      const sj_dz = sj_b.pos.z - sj_player.z;
      const sj_d = Math.hypot(sj_dx, sj_dz);
      if (sj_d < 2.2) {
        const sj_k = (2.2 - sj_d) * 2.5;
        sj_v3.x += (sj_dx / (sj_d + 1e-3)) * sj_k;
        sj_v3.z += (sj_dz / (sj_d + 1e-3)) * sj_k;
        sj_v3.y += sj_k * 0.8;
        sj_b.home.x += (sj_dx / (sj_d + 1e-3)) * sj_k * sj_dt * 2;
        sj_b.home.z += (sj_dz / (sj_d + 1e-3)) * sj_k * sj_dt * 2;
      }
      const sj_speed = Math.min(1.6, sj_v3.length());
      sj_v3.normalize().multiplyScalar(sj_speed);
      sj_b.vel.lerp(sj_v3, Math.min(1, sj_dt * 2.5));
      sj_b.pos.addScaledVector(sj_b.vel, sj_dt);
      sj_b.pos.y = Math.max(sj_b.pos.y, sj_ground + 0.15);
      // heading along the flight, banking a little, with a jittery flight
      sj_q.setFromAxisAngle(sj_Y, Math.atan2(-sj_b.vel.x, -sj_b.vel.z));
      sj_qTilt.setFromAxisAngle(sj_X, 0.25 + 0.15 * Math.sin(sj_time * 7 + sj_s));
      sj_q.multiply(sj_qTilt);
      sj_m4.compose(sj_b.pos, sj_q, sj_s3.setScalar(Math.min(1, sj_b.age * 1.5)));
      this.butterflyMesh.setMatrixAt(sj_i, sj_m4);
    });
    this.butterflyMesh.instanceMatrix.needsUpdate = true;

    // ---- dragonflies: dart, then hover ----
    this.dragonflies.forEach((sj_f, sj_i) => {
      sj_v3.subVectors(sj_f.target, sj_f.pos);
      const sj_dist = sj_v3.length();
      if (sj_dist > 0.05) {
        sj_f.pos.addScaledVector(sj_v3.normalize(), Math.min(sj_dist, sj_dt * 5.5));
      } else {
        sj_f.hover -= sj_dt;
        if (sj_f.hover <= 0) {
          sj_f.target = this.lakeSpot(sj_f.pos);
          sj_f.hover = this.rand.range(0.6, 2.6);
        }
      }
      const sj_jitter = 0.03 * Math.sin(sj_time * 13 + sj_f.seed);
      const sj_heading = Math.atan2(-(sj_f.target.x - sj_f.pos.x), -(sj_f.target.z - sj_f.pos.z));
      sj_q.setFromAxisAngle(sj_Y, sj_dist > 0.05 ? sj_heading : sj_f.seed);
      sj_v3.copy(sj_f.pos).setY(sj_f.pos.y + sj_jitter);
      sj_m4.compose(sj_v3, sj_q, sj_s3.setScalar(1.6));
      this.dragonflyMesh.setMatrixAt(sj_i, sj_m4);
    });
    this.dragonflyMesh.instanceMatrix.needsUpdate = true;

    // ---- birds: a flock wheeling over the valley ----
    const sj_t = sj_time * 0.045;
    const sj_cx = 8 + Math.cos(sj_t) * 58;
    const sj_cz = -6 + Math.sin(sj_t) * 42;
    const sj_cy = 34 + Math.sin(sj_time * 0.1) * 4;
    const sj_heading = Math.atan2(Math.sin(sj_t) * 58, -Math.cos(sj_t) * 42);
    sj_q.setFromAxisAngle(sj_Y, sj_heading);
    sj_qTilt.copy(sj_q).multiply(sj_BANK);
    this.birds.forEach((sj_bird, sj_i) => {
      sj_v3.copy(sj_bird.offset).applyQuaternion(sj_q);
      sj_v3.x += sj_cx + Math.sin(sj_time * 0.7 + sj_bird.phase) * 0.4;
      sj_v3.y += sj_cy + Math.sin(sj_time * 0.9 + sj_bird.phase) * 0.3;
      sj_v3.z += sj_cz;
      sj_m4.compose(sj_v3, sj_qTilt, sj_s3.setScalar(1.3));
      this.birdMesh.setMatrixAt(sj_i, sj_m4);
    });
    this.birdMesh.instanceMatrix.needsUpdate = true;
  }
}
