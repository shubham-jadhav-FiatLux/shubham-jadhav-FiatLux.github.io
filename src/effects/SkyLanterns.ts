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

const sj_m4 = new Matrix4();
const sj_q = new Quaternion();
const sj_s3 = new Vector3();
const sj_axis = new Vector3();

/**
 * Glowing paper sky lanterns that float up into the evening sky when the bell is rung,
 * drifting with the wind until they fade away.
 */
export class SkyLanterns {
  private mesh: InstancedMesh;
  private lanterns: Lantern[] = [];
  private readonly max = 24;

  constructor(sj_scene: Scene) {
    const sj_geo = new CylinderGeometry(0.26, 0.2, 0.5, 10, 1, true);
    // HDR colour so the bloom makes them glow.
    const sj_mat = new MeshBasicMaterial({ color: 0xffffff, fog: false });
    sj_mat.color.setRGB(3.2, 1.55, 0.55);
    this.mesh = new InstancedMesh(sj_geo, sj_mat, this.max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.name = 'sky-lanterns';
    sj_scene.add(this.mesh);
  }

  release(sj_at: { x: number; y: number; z: number }, sj_count = 14): void {
    for (let sj_i = 0; sj_i < sj_count && this.lanterns.length < this.max; sj_i++) {
      const sj_a = (sj_i / sj_count) * Math.PI * 2 + Math.random() * 0.4;
      const sj_r = 1.5 + Math.random() * 3.5;
      this.lanterns.push({
        pos: new Vector3(
          sj_at.x + Math.cos(sj_a) * sj_r,
          sj_at.y + 0.5 + Math.random() * 1.5,
          sj_at.z + Math.sin(sj_a) * sj_r,
        ),
        vel: new Vector3(
          (Math.random() - 0.5) * 0.4,
          0.9 + Math.random() * 0.8,
          (Math.random() - 0.5) * 0.4,
        ),
        age: -sj_i * 0.18,
        life: 22 + Math.random() * 8,
        phase: Math.random() * 10,
        scale: 0.8 + Math.random() * 0.5,
      });
    }
  }

  update(sj_dt: number, sj_wind: { x: number; y: number }): void {
    let sj_n = 0;
    this.lanterns = this.lanterns.filter((sj_l) => sj_l.age < sj_l.life);
    for (const sj_l of this.lanterns) {
      sj_l.age += sj_dt;
      if (sj_l.age < 0) continue;
      sj_l.pos.x +=
        (sj_l.vel.x + sj_wind.x * 0.9 + Math.sin(sj_l.age * 0.7 + sj_l.phase) * 0.25) * sj_dt;
      sj_l.pos.y += sj_l.vel.y * sj_dt;
      sj_l.pos.z +=
        (sj_l.vel.z + sj_wind.y * 0.9 + Math.cos(sj_l.age * 0.6 + sj_l.phase) * 0.25) * sj_dt;
      const sj_grow = Math.min(1, sj_l.age / 0.8);
      const sj_fade = 1 - Math.max(0, (sj_l.age - (sj_l.life - 4)) / 4);
      sj_axis.set(Math.sin(sj_l.phase), 0, Math.cos(sj_l.phase));
      sj_q.setFromAxisAngle(sj_axis, Math.sin(sj_l.age * 1.3 + sj_l.phase) * 0.12);
      sj_m4.compose(sj_l.pos, sj_q, sj_s3.setScalar(sj_l.scale * sj_grow * sj_fade));
      this.mesh.setMatrixAt(sj_n++, sj_m4);
    }
    this.mesh.count = sj_n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
