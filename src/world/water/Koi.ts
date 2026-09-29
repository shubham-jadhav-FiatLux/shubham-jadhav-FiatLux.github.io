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
import { globalUniforms } from '../../render/uniforms';
import { Random } from '../../utils/random';
import { SimplexNoise } from '../../utils/noise';
import { angleDelta, clamp } from '../../utils/math';
import { lakeSdf } from '../heightfield';
import { WATER_LEVEL } from '../layout';
import type { Terrain } from '../Terrain';

type Pattern = 'kohaku' | 'orange' | 'gold' | 'showa';

/** A koi body along +z (head forward) with fins, coloured by pattern. */
function createKoiGeometry(pattern: Pattern, seed: number): BufferGeometry {
  const noise = new SimplexNoise(seed);
  const profile: Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    // spindle: thick near the head, tapering to the tail
    const r = Math.sin(Math.PI * Math.pow(t, 0.75)) * 0.085 * (1 - t * 0.35);
    profile.push(new Vector2(Math.max(r, 0.002), -0.26 + t * 0.52));
  }
  let body: BufferGeometry = new LatheGeometry(profile, 14);
  body.rotateX(-Math.PI / 2); // lathe axis y → -z, so the thick head end faces +z
  body.scale(1, 0.78, 1);
  body.deleteAttribute('uv');
  body.deleteAttribute('normal');
  body = mergeVertices(body);
  // tail fin and pectoral fins
  const fin = new BufferGeometry();
  fin.setAttribute(
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
  const merged = mergeGeometries([body.toNonIndexed(), fin], false)!;
  merged.computeVertexNormals();
  const pos = merged.attributes.position as BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const white = new Color('#f5efe6');
  const orange = new Color('#ee6a1f');
  const red = new Color('#d8311f');
  const gold = new Color('#f2b632');
  const black = new Color('#1e1b1a');
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = noise.noise3(x * 9, y * 9, z * 9);
    const belly = y < -0.02;
    switch (pattern) {
      case 'kohaku':
        c.copy(n > 0.05 && !belly ? red : white);
        break;
      case 'orange':
        c.copy(orange).lerp(white, belly ? 0.5 : 0);
        break;
      case 'gold':
        c.copy(gold).lerp(white, belly ? 0.4 : n * 0.2);
        break;
      default:
        c.copy(n > 0.25 ? black : n > -0.1 ? red : white);
    }
    if (z < -0.24) c.lerp(white, 0.35); // translucent fins
    colors.set([c.r, c.g, c.b], i * 3);
  }
  merged.setAttribute('color', new BufferAttribute(colors, 3));
  return merged;
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

const m4 = new Matrix4();
const q = new Quaternion();
const q2 = new Quaternion();
const v3 = new Vector3();
const s3 = new Vector3(1, 1, 1);
const Y = new Vector3(0, 1, 0);
const X = new Vector3(1, 0, 0);

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
    count: number,
    private readonly onSplash: (x: number, z: number, strength: number) => void,
  ) {
    const patterns: Pattern[] = ['kohaku', 'orange', 'gold', 'showa'];
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.05,
      side: DoubleSide,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = globalUniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          float phase = float(gl_InstanceID) * 1.7;
          float along = clamp(0.2 - transformed.z, 0.0, 0.7);
          transformed.x += sin(transformed.z * 9.0 - uTime * 9.0 + phase) * 0.045 * along * 2.0;`,
        );
    };
    const perVariant = Math.ceil(count / patterns.length);
    patterns.forEach((p, vi) => {
      const mesh = new InstancedMesh(createKoiGeometry(p, 50 + vi), material, perVariant);
      mesh.castShadow = false;
      mesh.frustumCulled = false;
      mesh.name = `koi-${p}`;
      this.meshes.push(mesh);
    });
    let spawned = 0;
    for (let a = 0; a < 500 && spawned < count; a++) {
      const x = this.rand.range(10, 52);
      const z = this.rand.range(-30, 8);
      if (lakeSdf(x, z) > -3 || terrain.heightAt(x, z) > -1.1) continue;
      const variant = spawned % patterns.length;
      this.fish.push({
        x,
        z,
        heading: this.rand.range(0, Math.PI * 2),
        speed: this.rand.range(0.5, 0.9),
        depth: this.rand.range(0.35, 0.6),
        variant,
        index: Math.floor(spawned / patterns.length),
        wander: this.rand.range(0, 100),
        jumpT: -1,
      });
      spawned++;
    }
    this.meshes.forEach((m, vi) => (m.count = this.fish.filter((f) => f.variant === vi).length));
  }

  addTo(scene: Scene): void {
    for (const m of this.meshes) scene.add(m);
  }

  update(dt: number, time: number, player: Vector3): void {
    const noise = (t: number, s: number) =>
      Math.sin(t * 0.7 + s) * 0.6 + Math.sin(t * 1.9 + s * 2.1) * 0.4;
    // Occasionally a koi near the panda leaps out of the water.
    this.jumpTimer -= dt;
    if (this.jumpTimer <= 0) {
      this.jumpTimer = this.rand.range(7, 14);
      const near = this.fish.filter(
        (f) => f.jumpT < 0 && Math.hypot(f.x - player.x, f.z - player.z) < 26,
      );
      if (near.length) {
        const f = this.rand.pick(near);
        f.jumpT = 0;
        this.onSplash(f.x, f.z, 0.45);
      }
    }
    for (const f of this.fish) {
      // steering: wander + keep to deep water + flee the panda
      let turn = noise(time + f.wander, f.wander) * 0.9;
      const lx = f.x + Math.sin(f.heading) * 2.5;
      const lz = f.z + Math.cos(f.heading) * 2.5;
      if (lakeSdf(lx, lz) > -2.5 || this.terrain.heightAt(lx, lz) > -0.9) {
        const toCentre = Math.atan2(28 - f.x, -6 - f.z);
        turn += angleDelta(f.heading, toCentre) * 3;
      }
      const dx = f.x - player.x;
      const dz = f.z - player.z;
      const dp = Math.hypot(dx, dz);
      let speed = f.speed;
      if (dp < 3.5 && player.y < 0.5) {
        turn += angleDelta(f.heading, Math.atan2(dx, dz)) * 4;
        speed *= 2.4;
      }
      f.heading += clamp(turn, -2.5, 2.5) * dt;
      f.x += Math.sin(f.heading) * speed * dt;
      f.z += Math.cos(f.heading) * speed * dt;

      let y = WATER_LEVEL - f.depth + Math.sin(time * 0.8 + f.wander) * 0.05;
      let pitch = 0;
      if (f.jumpT >= 0) {
        f.jumpT += dt / 0.95;
        const t = f.jumpT;
        y = WATER_LEVEL - 0.2 + Math.sin(Math.PI * Math.min(t, 1)) * 0.9;
        pitch = (0.5 - t) * 2.4;
        if (t >= 1) {
          f.jumpT = -1;
          this.onSplash(f.x, f.z, 0.55);
        }
      }
      q.setFromAxisAngle(Y, f.heading);
      q2.setFromAxisAngle(X, -pitch);
      q.multiply(q2);
      m4.compose(v3.set(f.x, y, f.z), q, s3.setScalar(1.25));
      this.meshes[f.variant]!.setMatrixAt(f.index, m4);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}
