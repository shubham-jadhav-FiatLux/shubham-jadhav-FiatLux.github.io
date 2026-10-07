import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector2,
  Vector3,
  type Scene,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sj_globalUniforms } from '../../render/uniforms';
import { Random } from '../../utils/random';
import { SimplexNoise } from '../../utils/noise';
import { angleDelta, clamp } from '../../utils/math';
import { lakeSdf } from '../heightfield';
import { sj_WATER_LEVEL } from '../layout';
import type { Terrain } from '../Terrain';

type Pattern = 'kohaku' | 'orange' | 'gold' | 'showa';

/** A koi body along +z (head forward) with fins, coloured by pattern. */
function createKoiGeometry(sj_pattern: Pattern, sj_seed: number): BufferGeometry {
  const sj_noise = new SimplexNoise(sj_seed);
  const sj_profile: Vector2[] = [];
  for (let sj_i = 0; sj_i <= 12; sj_i++) {
    const sj_t = sj_i / 12;
    // spindle: thick near the head, tapering to the tail
    const sj_r = Math.sin(Math.PI * Math.pow(sj_t, 0.75)) * 0.085 * (1 - sj_t * 0.35);
    sj_profile.push(new Vector2(Math.max(sj_r, 0.002), -0.26 + sj_t * 0.52));
  }
  let sj_body: BufferGeometry = new LatheGeometry(sj_profile, 14);
  sj_body.rotateX(-Math.PI / 2); // lathe axis y → -z, so the thick head end faces +z
  sj_body.scale(1, 0.78, 1);
  sj_body.deleteAttribute('uv');
  sj_body.deleteAttribute('normal');
  sj_body = mergeVertices(sj_body);
  // tail fin and pectoral fins
  const sj_fin = new BufferGeometry();
  sj_fin.setAttribute(
    'position',
    new BufferAttribute(
      new Float32Array([
        // tail (two triangles forming a fork)
        0, 0, -0.24, 0, 0.09, -0.4, 0, 0.0, -0.34, 0, 0, -0.24, 0, 0.0, -0.34, 0, -0.09, -0.4,
        // pectoral fins
        0.05, -0.02, 0.1, 0.16, -0.04, 0.02, 0.05, -0.02, 0.02, -0.05, -0.02, 0.1, -0.05, -0.02,
        0.02, -0.16, -0.04, 0.02,
      ]),
      3,
    ),
  );
  const sj_merged = mergeGeometries([sj_body.toNonIndexed(), sj_fin], false)!;
  sj_merged.computeVertexNormals();
  const sj_pos = sj_merged.attributes.position as BufferAttribute;
  const sj_colors = new Float32Array(sj_pos.count * 3);
  const sj_white = new Color('#f5efe6');
  const sj_orange = new Color('#ee6a1f');
  const sj_red = new Color('#d8311f');
  const sj_gold = new Color('#f2b632');
  const sj_black = new Color('#1e1b1a');
  const sj_c = new Color();
  for (let sj_i = 0; sj_i < sj_pos.count; sj_i++) {
    const sj_x = sj_pos.getX(sj_i);
    const sj_y = sj_pos.getY(sj_i);
    const sj_z = sj_pos.getZ(sj_i);
    const sj_n = sj_noise.noise3(sj_x * 9, sj_y * 9, sj_z * 9);
    const sj_belly = sj_y < -0.02;
    switch (sj_pattern) {
      case 'kohaku':
        sj_c.copy(sj_n > 0.05 && !sj_belly ? sj_red : sj_white);
        break;
      case 'orange':
        sj_c.copy(sj_orange).lerp(sj_white, sj_belly ? 0.5 : 0);
        break;
      case 'gold':
        sj_c.copy(sj_gold).lerp(sj_white, sj_belly ? 0.4 : sj_n * 0.2);
        break;
      default:
        sj_c.copy(sj_n > 0.25 ? sj_black : sj_n > -0.1 ? sj_red : sj_white);
    }
    if (sj_z < -0.24) sj_c.lerp(sj_white, 0.35); // translucent fins
    sj_colors.set([sj_c.r, sj_c.g, sj_c.b], sj_i * 3);
  }
  sj_merged.setAttribute('color', new BufferAttribute(sj_colors, 3));
  return sj_merged;
}

interface Fish {
  x: number;
  z: number;
  heading: number;
  speed: number;
  depth: number;
  variant: number;
  index: number;
  wander: number;
  jumpT: number;
}

const sj_m4 = new Matrix4();
const sj_q = new Quaternion();
const sj_q2 = new Quaternion();
const sj_v3 = new Vector3();
const sj_s3 = new Vector3(1, 1, 1);
const sj_Y = new Vector3(0, 1, 0);
const sj_X = new Vector3(1, 0, 0);

/**
 * A small school of koi wandering the lake below the surface. They swish their tails,
 * keep to deep water, scatter when the panda comes close, and now and then one leaps.
 */
export class Koi {
  private meshes: InstancedMesh[] = [];
  private fish: Fish[] = [];
  private rand = new Random(31);
  private jumpTimer = 6;

  constructor(
    private readonly terrain: Terrain,
    sj_count: number,
    private readonly onSplash: (sj_x: number, sj_z: number, sj_strength: number) => void,
  ) {
    const sj_patterns: Pattern[] = ['kohaku', 'orange', 'gold', 'showa'];
    const sj_material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.05,
      side: DoubleSide,
    });
    sj_material.onBeforeCompile = (sj_shader) => {
      sj_shader.uniforms.uTime = sj_globalUniforms.uTime;
      sj_shader.vertexShader = sj_shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          float phase = float(gl_InstanceID) * 1.7;
          float along = clamp(0.2 - transformed.z, 0.0, 0.7);
          transformed.x += sin(transformed.z * 9.0 - uTime * 9.0 + phase) * 0.045 * along * 2.0;`,
        );
    };
    const sj_perVariant = Math.ceil(sj_count / sj_patterns.length);
    sj_patterns.forEach((sj_p, sj_vi) => {
      const sj_mesh = new InstancedMesh(
        createKoiGeometry(sj_p, 50 + sj_vi),
        sj_material,
        sj_perVariant,
      );
      sj_mesh.castShadow = false;
      sj_mesh.frustumCulled = false;
      sj_mesh.name = `koi-${sj_p}`;
      this.meshes.push(sj_mesh);
    });
    let sj_spawned = 0;
    for (let sj_a = 0; sj_a < 500 && sj_spawned < sj_count; sj_a++) {
      const sj_x = this.rand.range(10, 52);
      const sj_z = this.rand.range(-30, 8);
      if (lakeSdf(sj_x, sj_z) > -3 || terrain.heightAt(sj_x, sj_z) > -1.1) continue;
      const sj_variant = sj_spawned % sj_patterns.length;
      this.fish.push({
        x: sj_x,
        z: sj_z,
        heading: this.rand.range(0, Math.PI * 2),
        speed: this.rand.range(0.5, 0.9),
        depth: this.rand.range(0.35, 0.6),
        variant: sj_variant,
        index: Math.floor(sj_spawned / sj_patterns.length),
        wander: this.rand.range(0, 100),
        jumpT: -1,
      });
      sj_spawned++;
    }
    this.meshes.forEach(
      (sj_m, sj_vi) => (sj_m.count = this.fish.filter((sj_f) => sj_f.variant === sj_vi).length),
    );
  }

  addTo(sj_scene: Scene): void {
    for (const sj_m of this.meshes) sj_scene.add(sj_m);
  }

  /**
   * Brings the `sj_count` koi nearest to (x, z) around that spot, swimming towards
   * `heading` (or any way), for a shot in the tour. They wander on from there as usual.
   */
  gather(sj_x: number, sj_z: number, sj_count: number, sj_heading?: number): void {
    const sj_near = [...this.fish]
      .sort(
        (sj_a, sj_b) =>
          Math.hypot(sj_a.x - sj_x, sj_a.z - sj_z) - Math.hypot(sj_b.x - sj_x, sj_b.z - sj_z),
      )
      .slice(0, sj_count);
    for (const sj_f of sj_near) {
      for (let sj_k = 0; sj_k < 16; sj_k++) {
        const sj_fx = sj_x + this.rand.range(-2.6, 2.6);
        const sj_fz = sj_z + this.rand.range(-2.6, 2.6);
        if (lakeSdf(sj_fx, sj_fz) > -2.5 || this.terrain.heightAt(sj_fx, sj_fz) > -0.9) continue;
        sj_f.x = sj_fx;
        sj_f.z = sj_fz;
        sj_f.heading = (sj_heading ?? this.rand.range(0, Math.PI * 2)) + this.rand.range(-0.4, 0.4);
        break;
      }
    }
  }

  /** The koi nearest to (x, z) leaps out of the water now. */
  leap(sj_x: number, sj_z: number): void {
    let sj_best: Fish | null = null;
    let sj_bestD = Infinity;
    for (const sj_f of this.fish) {
      const sj_d = Math.hypot(sj_f.x - sj_x, sj_f.z - sj_z);
      if (sj_f.jumpT < 0 && sj_d < sj_bestD) {
        sj_best = sj_f;
        sj_bestD = sj_d;
      }
    }
    if (!sj_best) return;
    sj_best.jumpT = 0;
    this.jumpTimer = Math.max(this.jumpTimer, 6);
    this.onSplash(sj_best.x, sj_best.z, 0.45);
  }

  update(sj_dt: number, sj_time: number, sj_player: Vector3): void {
    const sj_noise = (sj_t: number, sj_s: number) =>
      Math.sin(sj_t * 0.7 + sj_s) * 0.6 + Math.sin(sj_t * 1.9 + sj_s * 2.1) * 0.4;
    // Occasionally a koi near the panda leaps out of the water.
    this.jumpTimer -= sj_dt;
    if (this.jumpTimer <= 0) {
      this.jumpTimer = this.rand.range(7, 14);
      const sj_near = this.fish.filter(
        (sj_f) => sj_f.jumpT < 0 && Math.hypot(sj_f.x - sj_player.x, sj_f.z - sj_player.z) < 26,
      );
      if (sj_near.length) {
        const sj_f = this.rand.pick(sj_near);
        sj_f.jumpT = 0;
        this.onSplash(sj_f.x, sj_f.z, 0.45);
      }
    }
    for (const sj_f of this.fish) {
      // steering: wander + keep to deep water + flee the panda
      let sj_turn = sj_noise(sj_time + sj_f.wander, sj_f.wander) * 0.9;
      const sj_lx = sj_f.x + Math.sin(sj_f.heading) * 2.5;
      const sj_lz = sj_f.z + Math.cos(sj_f.heading) * 2.5;
      if (lakeSdf(sj_lx, sj_lz) > -2.5 || this.terrain.heightAt(sj_lx, sj_lz) > -0.9) {
        const sj_toCentre = Math.atan2(28 - sj_f.x, -6 - sj_f.z);
        sj_turn += angleDelta(sj_f.heading, sj_toCentre) * 3;
      }
      const sj_dx = sj_f.x - sj_player.x;
      const sj_dz = sj_f.z - sj_player.z;
      const sj_dp = Math.hypot(sj_dx, sj_dz);
      let sj_speed = sj_f.speed;
      if (sj_dp < 3.5 && sj_player.y < 0.5) {
        sj_turn += angleDelta(sj_f.heading, Math.atan2(sj_dx, sj_dz)) * 4;
        sj_speed *= 2.4;
      }
      sj_f.heading += clamp(sj_turn, -2.5, 2.5) * sj_dt;
      sj_f.x += Math.sin(sj_f.heading) * sj_speed * sj_dt;
      sj_f.z += Math.cos(sj_f.heading) * sj_speed * sj_dt;

      let sj_y = sj_WATER_LEVEL - sj_f.depth + Math.sin(sj_time * 0.8 + sj_f.wander) * 0.05;
      let sj_pitch = 0;
      if (sj_f.jumpT >= 0) {
        sj_f.jumpT += sj_dt / 0.95;
        const sj_t = sj_f.jumpT;
        sj_y = sj_WATER_LEVEL - 0.2 + Math.sin(Math.PI * Math.min(sj_t, 1)) * 0.9;
        sj_pitch = (0.5 - sj_t) * 2.4;
        if (sj_t >= 1) {
          sj_f.jumpT = -1;
          this.onSplash(sj_f.x, sj_f.z, 0.55);
        }
      }
      sj_q.setFromAxisAngle(sj_Y, sj_f.heading);
      sj_q2.setFromAxisAngle(sj_X, -sj_pitch);
      sj_q.multiply(sj_q2);
      sj_m4.compose(sj_v3.set(sj_f.x, sj_y, sj_f.z), sj_q, sj_s3.setScalar(1.25));
      this.meshes[sj_f.variant]!.setMatrixAt(sj_f.index, sj_m4);
    }
    for (const sj_m of this.meshes) sj_m.instanceMatrix.needsUpdate = true;
  }
}
