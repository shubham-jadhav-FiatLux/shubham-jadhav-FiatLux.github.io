import {
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type Scene,
} from 'three';

interface Lantern {
  pos: Vector3;
  vel: Vector3;
  age: number;
  life: number;
  phase: number;
  scale: number;
}

const m4 = new Matrix4();
const q = new Quaternion();
const s3 = new Vector3();
const axis = new Vector3();

/**
 * Glowing paper sky lanterns that float up into the evening sky when the bell is rung,
 * drifting with the wind until they fade away.
 */
export class SkyLanterns {
  private mesh: InstancedMesh;
  private lanterns: Lantern[] = [];
  private readonly max = 24;

  constructor(scene: Scene) {
    const geo = new CylinderGeometry(0.26, 0.2, 0.5, 10, 1, true);
    // HDR colour so the bloom makes them glow.
    const mat = new MeshBasicMaterial({ color: 0xffffff, fog: false });
    mat.color.setRGB(3.2, 1.55, 0.55);
    this.mesh = new InstancedMesh(geo, mat, this.max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.name = 'sky-lanterns';
    scene.add(this.mesh);
  }

  release(at: { x: number; y: number; z: number }, count = 14): void {
    for (let i = 0; i < count && this.lanterns.length < this.max; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const r = 1.5 + Math.random() * 3.5;
      this.lanterns.push({
        pos: new Vector3(
          at.x + Math.cos(a) * r,
          at.y + 0.5 + Math.random() * 1.5,
          at.z + Math.sin(a) * r,
        ),
        vel: new Vector3(
          (Math.random() - 0.5) * 0.4,
          0.9 + Math.random() * 0.8,
          (Math.random() - 0.5) * 0.4,
        ),
        age: -i * 0.18,
        life: 22 + Math.random() * 8,
        phase: Math.random() * 10,
        scale: 0.8 + Math.random() * 0.5,
      });
    }
  }

  update(dt: number, wind: { x: number; y: number }): void {
    let n = 0;
    this.lanterns = this.lanterns.filter((l) => l.age < l.life);
    for (const l of this.lanterns) {
      l.age += dt;
      if (l.age < 0) continue;
      l.pos.x += (l.vel.x + wind.x * 0.9 + Math.sin(l.age * 0.7 + l.phase) * 0.25) * dt;
      l.pos.y += l.vel.y * dt;
      l.pos.z += (l.vel.z + wind.y * 0.9 + Math.cos(l.age * 0.6 + l.phase) * 0.25) * dt;
      const grow = Math.min(1, l.age / 0.8);
      const fade = 1 - Math.max(0, (l.age - (l.life - 4)) / 4);
      axis.set(Math.sin(l.phase), 0, Math.cos(l.phase));
      q.setFromAxisAngle(axis, Math.sin(l.age * 1.3 + l.phase) * 0.12);
      m4.compose(l.pos, q, s3.setScalar(l.scale * grow * fade));
      this.mesh.setMatrixAt(n++, m4);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
