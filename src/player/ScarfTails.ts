import { BufferAttribute, BufferGeometry, Mesh, Vector3, type Material, type Scene } from 'three';
import type { Panda } from './Panda';

interface Chain {
  pos: Vector3[];
  prev: Vector3[];
  seg: number;
  width: number;
  anchorOffset: Vector3;
}

const SEGMENTS = 7;
const GRAVITY = new Vector3(0, -9.8, 0);
const tmp = new Vector3();
const tmp2 = new Vector3();
const right = new Vector3();
const anchor = new Vector3();
const bodyCenter = new Vector3();
const headCenter = new Vector3();

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
    material: Material,
  ) {
    this.chains = [
      { seg: 0.07, width: 0.088, anchorOffset: new Vector3(0.02, 0, 0) },
      { seg: 0.058, width: 0.078, anchorOffset: new Vector3(-0.03, -0.02, 0.01) },
    ].map((c) => ({
      ...c,
      pos: Array.from({ length: SEGMENTS }, () => new Vector3()),
      prev: Array.from({ length: SEGMENTS }, () => new Vector3()),
    }));
    const vertsPerChain = SEGMENTS * 2;
    this.positions = new Float32Array(this.chains.length * vertsPerChain * 3);
    const index: number[] = [];
    this.chains.forEach((_, ci) => {
      const base = ci * vertsPerChain;
      for (let i = 0; i < SEGMENTS - 1; i++) {
        const a = base + i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    // u across a tail, v along it from the knot to the fringed end
    const uv = new Float32Array(this.chains.length * vertsPerChain * 2);
    this.chains.forEach((_, ci) => {
      for (let i = 0; i < SEGMENTS; i++) {
        const k = (ci * vertsPerChain + i * 2) * 2;
        const v = i / (SEGMENTS - 1);
        uv.set([0, v, 1, v], k);
      }
    });
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('uv', new BufferAttribute(uv, 2));
    this.geometry.setIndex(index);
    this.mesh = new Mesh(this.geometry, material);
    this.mesh.name = 'scarf-tails';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
  }

  addTo(scene: Scene): void {
    scene.add(this.mesh);
  }

  private reset(): void {
    this.panda.scarfKnot.getWorldPosition(anchor);
    for (const c of this.chains) {
      for (let i = 0; i < SEGMENTS; i++) {
        c.pos[i]!.set(anchor.x, anchor.y - i * c.seg, anchor.z).add(c.anchorOffset);
        c.prev[i]!.copy(c.pos[i]!);
      }
    }
    this.initialised = true;
  }

  /** Instantly re-hang the tails (after teleporting). */
  snap(): void {
    this.initialised = false;
  }

  update(dt: number, wind: { x: number; y: number }, windStrength: number, time: number): void {
    this.panda.root.updateMatrixWorld(true);
    if (!this.initialised) this.reset();
    const step = Math.min(dt, 1 / 30);
    this.panda.scarfKnot.getWorldPosition(anchor);
    this.panda.body.localToWorld(bodyCenter.set(0, 0.56, 0));
    this.panda.head.localToWorld(headCenter.set(0, 0, 0));
    right.set(1, 0, 0).applyQuaternion(this.panda.root.quaternion);

    const gust = (0.6 + 0.4 * Math.sin(time * 2.3)) * windStrength;
    for (const c of this.chains) {
      // Verlet integration.
      for (let i = 1; i < SEGMENTS; i++) {
        const p = c.pos[i]!;
        const pr = c.prev[i]!;
        tmp.subVectors(p, pr).multiplyScalar(0.94);
        pr.copy(p);
        p.add(tmp);
        tmp2.set(wind.x * gust * 1.6, 0, wind.y * gust * 1.6).add(GRAVITY);
        tmp2.x += Math.sin(time * 9 + i) * 0.6;
        p.addScaledVector(tmp2, step * step);
      }
      c.pos[0]!.copy(anchor).add(c.anchorOffset);
      c.prev[0]!.copy(c.pos[0]!);
      // Distance constraints + body collision.
      for (let it = 0; it < 5; it++) {
        for (let i = 1; i < SEGMENTS; i++) {
          const a = c.pos[i - 1]!;
          const b = c.pos[i]!;
          tmp.subVectors(b, a);
          const len = tmp.length() || 1e-6;
          const diff = (len - c.seg) / len;
          if (i === 1) b.addScaledVector(tmp, -diff);
          else {
            a.addScaledVector(tmp, diff * 0.5);
            b.addScaledVector(tmp, -diff * 0.5);
          }
        }
        for (let i = 1; i < SEGMENTS; i++) {
          this.pushOutSphere(c.pos[i]!, bodyCenter, 0.41);
          this.pushOutSphere(c.pos[i]!, headCenter, 0.39);
        }
      }
    }
    this.writeGeometry();
  }

  private pushOutSphere(p: Vector3, center: Vector3, radius: number): void {
    tmp.subVectors(p, center);
    const d = tmp.length();
    if (d < radius && d > 1e-5) p.copy(center).addScaledVector(tmp, radius / d);
  }

  private writeGeometry(): void {
    let o = 0;
    for (const c of this.chains) {
      for (let i = 0; i < SEGMENTS; i++) {
        const p = c.pos[i]!;
        const next = c.pos[Math.min(i + 1, SEGMENTS - 1)]!;
        const prev = c.pos[Math.max(i - 1, 0)]!;
        tmp.subVectors(next, prev).normalize();
        // Side vector: the panda's right axis made perpendicular to the ribbon.
        tmp2.copy(right).addScaledVector(tmp, -right.dot(tmp)).normalize();
        const w = c.width * (1 - (i / (SEGMENTS - 1)) * 0.2) * 0.5;
        this.positions[o++] = p.x - tmp2.x * w;
        this.positions[o++] = p.y - tmp2.y * w;
        this.positions[o++] = p.z - tmp2.z * w;
        this.positions[o++] = p.x + tmp2.x * w;
        this.positions[o++] = p.y + tmp2.y * w;
        this.positions[o++] = p.z + tmp2.z * w;
      }
    }
    const attr = this.geometry.attributes.position as BufferAttribute;
    attr.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}
