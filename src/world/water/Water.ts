import type { Scene, Vector3 } from 'three';
import { Random } from '../../utils/random';
import { distToPolyline } from '../../utils/math';
import { lakeSdf } from '../heightfield';
import { BRIDGE_POINTS, CLIFF, PLACES, WATER_LEVEL } from '../layout';
import type { Terrain } from '../Terrain';
import type { Particles } from '../../effects/Particles';
import type { QualitySettings } from '../../core/Quality';
import { Lake } from './Lake';
import { Waterfall } from './Waterfall';
import { Koi } from './Koi';
import { Lotus } from './Lotus';

/** Everything wet: the lake surface, waterfall, koi and lotus. */
export class Water {
  readonly lake: Lake;
  readonly waterfall: Waterfall;
  readonly koi: Koi;
  readonly lotus: Lotus;
  private rippleTimer = 0;

  constructor(
    private readonly terrain: Terrain,
    private readonly particles: Particles,
    settings: QualitySettings,
    onSplash: (x: number, z: number, strength: number) => void,
  ) {
    this.lake = new Lake({ x0: 0, z0: -40, x1: 62, z1: 18 });
    this.waterfall = new Waterfall(terrain, PLACES.waterfall, CLIFF);
    this.koi = new Koi(terrain, Math.round(14 * Math.max(0.6, settings.detail)), (x, z, s) => {
      this.lake.ripple(x, z, s * 1.4);
      onSplash(x, z, s);
    });
    this.lotus = new Lotus(this.planLotus());
  }

  private planLotus() {
    const rand = new Random(64);
    const pads: { x: number; z: number; s: number; rot: number; flower: boolean }[] = [];
    // Pads gather in a few colonies in the shallows.
    const colonies: { x: number; z: number }[] = [];
    for (let a = 0; a < 400 && colonies.length < 7; a++) {
      const x = rand.range(4, 56);
      const z = rand.range(-34, 14);
      const depth = WATER_LEVEL - this.terrain.heightAt(x, z);
      if (depth < 0.4 || depth > 1.3) continue;
      if (distToPolyline(x, z, BRIDGE_POINTS) < 4) continue;
      if (Math.hypot(x - PLACES.pavilion.x, z - PLACES.pavilion.z) < 7) continue;
      if (Math.hypot(x - this.waterfall.bottom.x, z - this.waterfall.bottom.z) < 7) continue;
      if (colonies.some((c) => Math.hypot(c.x - x, c.z - z) < 9)) continue;
      colonies.push({ x, z });
    }
    for (const c of colonies) {
      const n = rand.int(7, 13);
      for (
        let i = 0;
        i < n * 4 && pads.filter((p) => Math.hypot(p.x - c.x, p.z - c.z) < 4).length < n;
        i++
      ) {
        const a = rand.range(0, Math.PI * 2);
        const r = Math.sqrt(rand.float()) * 3.2;
        const x = c.x + Math.cos(a) * r;
        const z = c.z + Math.sin(a) * r;
        const depth = WATER_LEVEL - this.terrain.heightAt(x, z);
        if (depth < 0.25 || lakeSdf(x, z) > -0.5) continue;
        const s = rand.range(0.6, 1.25);
        if (pads.some((p) => Math.hypot(p.x - x, p.z - z) < (p.s + s) * 0.48)) continue;
        pads.push({ x, z, s, rot: rand.range(0, Math.PI * 2), flower: rand.chance(0.22) });
      }
    }
    return pads;
  }

  addTo(scene: Scene): void {
    this.lake.addTo(scene);
    this.waterfall.addTo(scene);
    this.koi.addTo(scene);
    this.lotus.addTo(scene);
  }

  update(
    dt: number,
    time: number,
    player: { position: Vector3; wading: boolean; swimming: boolean; speed: number },
    particleAmount: number,
  ): void {
    this.koi.update(dt, time, player.position);
    this.waterfall.update(dt, this.particles, particleAmount);
    if ((player.wading || player.swimming) && player.speed > 0.4) {
      this.rippleTimer -= dt;
      if (this.rippleTimer <= 0) {
        this.rippleTimer = player.swimming ? 0.45 : 0.32;
        this.lake.ripple(player.position.x, player.position.z, player.swimming ? 0.9 : 0.6);
      }
    }
  }
}
