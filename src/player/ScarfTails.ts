import { BufferAttribute, BufferGeometry, Mesh, Vector3, type Material, type Scene } from 'three';
import type { Panda } from './Panda';

interface Chain {
  pos: Vector3[];
  prev: Vector3[];
  seg: number;
  width: number;
  anchorOffset: Vector3;
}

const sj_SEGMENTS = 7;
const sj_GRAVITY = new Vector3(0, -9.8, 0);
const sj_tmp = new Vector3();
const sj_tmp2 = new Vector3();
const sj_right = new Vector3();
const sj_anchor = new Vector3();
const sj_bodyCenter = new Vector3();
const sj_headCenter = new Vector3();

/**
 * Two scarf tails simulated as Verlet chains and rendered as tapered ribbons.
 * They trail behind when running, flutter in the wind and swing during the spin kick.
 */
export class ScarfTails {
  readonly mesh: Mesh;
  private chains: Chain[];
  private geometry: BufferGeometry;
  private positions: Float32Array;
  private initialised = false;

  constructor(
    private readonly panda: Panda,
    sj_material: Material,
  ) {
    this.chains = [
      { seg: 0.07, width: 0.088, anchorOffset: new Vector3(0.02, 0, 0) },
      { seg: 0.058, width: 0.078, anchorOffset: new Vector3(-0.03, -0.02, 0.01) },
    ].map((sj_c) => ({
      ...sj_c,
      pos: Array.from({ length: sj_SEGMENTS }, () => new Vector3()),
      prev: Array.from({ length: sj_SEGMENTS }, () => new Vector3()),
    }));
    const sj_vertsPerChain = sj_SEGMENTS * 2;
    this.positions = new Float32Array(this.chains.length * sj_vertsPerChain * 3);
    const sj_index: number[] = [];
    this.chains.forEach((_sj, sj_ci) => {
      const sj_base = sj_ci * sj_vertsPerChain;
      for (let sj_i = 0; sj_i < sj_SEGMENTS - 1; sj_i++) {
        const sj_a = sj_base + sj_i * 2;
        sj_index.push(sj_a, sj_a + 1, sj_a + 2, sj_a + 1, sj_a + 3, sj_a + 2);
      }
    });
    // u across a tail, v along it from the knot to the fringed end
    const sj_uv = new Float32Array(this.chains.length * sj_vertsPerChain * 2);
    this.chains.forEach((_sj, sj_ci) => {
      for (let sj_i = 0; sj_i < sj_SEGMENTS; sj_i++) {
        const sj_k = (sj_ci * sj_vertsPerChain + sj_i * 2) * 2;
        const sj_v = sj_i / (sj_SEGMENTS - 1);
        sj_uv.set([0, sj_v, 1, sj_v], sj_k);
      }
    });
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('uv', new BufferAttribute(sj_uv, 2));
    this.geometry.setIndex(sj_index);
    this.mesh = new Mesh(this.geometry, sj_material);
    this.mesh.name = 'scarf-tails';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
  }

  addTo(sj_scene: Scene): void {
    sj_scene.add(this.mesh);
  }

  private reset(): void {
    this.panda.scarfKnot.getWorldPosition(sj_anchor);
    for (const sj_c of this.chains) {
      for (let sj_i = 0; sj_i < sj_SEGMENTS; sj_i++) {
        sj_c.pos[sj_i]!.set(sj_anchor.x, sj_anchor.y - sj_i * sj_c.seg, sj_anchor.z).add(
          sj_c.anchorOffset,
        );
        sj_c.prev[sj_i]!.copy(sj_c.pos[sj_i]!);
      }
    }
    this.initialised = true;
  }

  /** Instantly re-hang the tails (after teleporting). */
  snap(): void {
    this.initialised = false;
  }

  update(
    sj_dt: number,
    sj_wind: { x: number; y: number },
    sj_windStrength: number,
    sj_time: number,
  ): void {
    this.panda.root.updateMatrixWorld(true);
    if (!this.initialised) this.reset();
    const sj_step = Math.min(sj_dt, 1 / 30);
    this.panda.scarfKnot.getWorldPosition(sj_anchor);
    this.panda.body.localToWorld(sj_bodyCenter.set(0, 0.56, 0));
    this.panda.head.localToWorld(sj_headCenter.set(0, 0, 0));
    sj_right.set(1, 0, 0).applyQuaternion(this.panda.root.quaternion);

    const sj_gust = (0.6 + 0.4 * Math.sin(sj_time * 2.3)) * sj_windStrength;
    for (const sj_c of this.chains) {
      // Verlet integration.
      for (let sj_i = 1; sj_i < sj_SEGMENTS; sj_i++) {
        const sj_p = sj_c.pos[sj_i]!;
        const sj_pr = sj_c.prev[sj_i]!;
        sj_tmp.subVectors(sj_p, sj_pr).multiplyScalar(0.94);
        sj_pr.copy(sj_p);
        sj_p.add(sj_tmp);
        sj_tmp2.set(sj_wind.x * sj_gust * 1.6, 0, sj_wind.y * sj_gust * 1.6).add(sj_GRAVITY);
        sj_tmp2.x += Math.sin(sj_time * 9 + sj_i) * 0.6;
        sj_p.addScaledVector(sj_tmp2, sj_step * sj_step);
      }
      sj_c.pos[0]!.copy(sj_anchor).add(sj_c.anchorOffset);
      sj_c.prev[0]!.copy(sj_c.pos[0]!);
      // Distance constraints + body collision.
      for (let sj_it = 0; sj_it < 5; sj_it++) {
        for (let sj_i = 1; sj_i < sj_SEGMENTS; sj_i++) {
          const sj_a = sj_c.pos[sj_i - 1]!;
          const sj_b = sj_c.pos[sj_i]!;
          sj_tmp.subVectors(sj_b, sj_a);
          const sj_len = sj_tmp.length() || 1e-6;
          const sj_diff = (sj_len - sj_c.seg) / sj_len;
          if (sj_i === 1) sj_b.addScaledVector(sj_tmp, -sj_diff);
          else {
            sj_a.addScaledVector(sj_tmp, sj_diff * 0.5);
            sj_b.addScaledVector(sj_tmp, -sj_diff * 0.5);
          }
        }
        for (let sj_i = 1; sj_i < sj_SEGMENTS; sj_i++) {
          this.pushOutSphere(sj_c.pos[sj_i]!, sj_bodyCenter, 0.41);
          this.pushOutSphere(sj_c.pos[sj_i]!, sj_headCenter, 0.39);
        }
      }
    }
    this.writeGeometry();
  }

  private pushOutSphere(sj_p: Vector3, sj_center: Vector3, sj_radius: number): void {
    sj_tmp.subVectors(sj_p, sj_center);
    const sj_d = sj_tmp.length();
    if (sj_d < sj_radius && sj_d > 1e-5)
      sj_p.copy(sj_center).addScaledVector(sj_tmp, sj_radius / sj_d);
  }

  private writeGeometry(): void {
    let sj_o = 0;
    for (const sj_c of this.chains) {
      for (let sj_i = 0; sj_i < sj_SEGMENTS; sj_i++) {
        const sj_p = sj_c.pos[sj_i]!;
        const sj_next = sj_c.pos[Math.min(sj_i + 1, sj_SEGMENTS - 1)]!;
        const sj_prev = sj_c.pos[Math.max(sj_i - 1, 0)]!;
        sj_tmp.subVectors(sj_next, sj_prev).normalize();
        // Side vector: the panda's right axis made perpendicular to the ribbon.
        sj_tmp2.copy(sj_right).addScaledVector(sj_tmp, -sj_right.dot(sj_tmp)).normalize();
        const sj_w = sj_c.width * (1 - (sj_i / (sj_SEGMENTS - 1)) * 0.2) * 0.5;
        this.positions[sj_o++] = sj_p.x - sj_tmp2.x * sj_w;
        this.positions[sj_o++] = sj_p.y - sj_tmp2.y * sj_w;
        this.positions[sj_o++] = sj_p.z - sj_tmp2.z * sj_w;
        this.positions[sj_o++] = sj_p.x + sj_tmp2.x * sj_w;
        this.positions[sj_o++] = sj_p.y + sj_tmp2.y * sj_w;
        this.positions[sj_o++] = sj_p.z + sj_tmp2.z * sj_w;
      }
    }
    const sj_attr = this.geometry.attributes.position as BufferAttribute;
    sj_attr.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}
