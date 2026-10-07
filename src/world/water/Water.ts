import type { Scene, Vector3 } from 'three';
import { Random } from '../../utils/random';
import { distToPolyline } from '../../utils/math';
import { lakeSdf } from '../heightfield';
import { sj_BRIDGE_POINTS, sj_PLACES, sj_WATER_LEVEL } from '../layout';
import type { Terrain } from '../Terrain';
import type { Particles } from '../../effects/Particles';
import type { QualitySettings } from '../../core/Quality';
import { Lake } from './Lake';
import { Waterfall } from './Waterfall';
import { River } from './River';
import { Koi } from './Koi';
import { Lotus } from './Lotus';

/** Everything wet: the lake surface, waterfall, koi and lotus. */
export class Water {
  readonly lake: Lake;
  readonly waterfall: Waterfall;
  readonly river: River;
  readonly koi: Koi;
  readonly lotus: Lotus;
  private rippleTimer = 0;

  constructor(
    private readonly terrain: Terrain,
    private readonly particles: Particles,
    sj_settings: QualitySettings,
    sj_onSplash: (sj_x: number, sj_z: number, sj_strength: number) => void,
  ) {
    this.lake = new Lake({ x0: 0, z0: -40, x1: 62, z1: 18 });
    this.waterfall = new Waterfall();
    this.river = new River();
    this.koi = new Koi(
      terrain,
      Math.round(14 * Math.max(0.6, sj_settings.detail)),
      (sj_x, sj_z, sj_s) => {
        this.lake.ripple(sj_x, sj_z, sj_s * 1.4);
        sj_onSplash(sj_x, sj_z, sj_s);
      },
    );
    this.lotus = new Lotus(this.planLotus());
  }

  private planLotus() {
    const sj_rand = new Random(64);
    const sj_pads: { x: number; z: number; s: number; rot: number; flower: boolean }[] = [];
    // Pads gather in a few colonies in the shallows.
    const sj_colonies: { x: number; z: number }[] = [];
    for (let sj_a = 0; sj_a < 400 && sj_colonies.length < 7; sj_a++) {
      const sj_x = sj_rand.range(4, 56);
      const sj_z = sj_rand.range(-34, 14);
      const sj_depth = sj_WATER_LEVEL - this.terrain.heightAt(sj_x, sj_z);
      if (sj_depth < 0.4 || sj_depth > 1.3) continue;
      if (distToPolyline(sj_x, sj_z, sj_BRIDGE_POINTS) < 4) continue;
      if (Math.hypot(sj_x - sj_PLACES.pavilion.x, sj_z - sj_PLACES.pavilion.z) < 7) continue;
      if (Math.hypot(sj_x - this.waterfall.bottom.x, sj_z - this.waterfall.bottom.z) < 7) continue;
      if (sj_colonies.some((sj_c) => Math.hypot(sj_c.x - sj_x, sj_c.z - sj_z) < 9)) continue;
      sj_colonies.push({ x: sj_x, z: sj_z });
    }
    for (const sj_c of sj_colonies) {
      const sj_n = sj_rand.int(7, 13);
      for (
        let sj_i = 0;
        sj_i < sj_n * 4 &&
        sj_pads.filter((sj_p) => Math.hypot(sj_p.x - sj_c.x, sj_p.z - sj_c.z) < 4).length < sj_n;
        sj_i++
      ) {
        const sj_a = sj_rand.range(0, Math.PI * 2);
        const sj_r = Math.sqrt(sj_rand.float()) * 3.2;
        const sj_x = sj_c.x + Math.cos(sj_a) * sj_r;
        const sj_z = sj_c.z + Math.sin(sj_a) * sj_r;
        const sj_depth = sj_WATER_LEVEL - this.terrain.heightAt(sj_x, sj_z);
        if (sj_depth < 0.25 || lakeSdf(sj_x, sj_z) > -0.5) continue;
        const sj_s = sj_rand.range(0.6, 1.25);
        if (
          sj_pads.some((sj_p) => Math.hypot(sj_p.x - sj_x, sj_p.z - sj_z) < (sj_p.s + sj_s) * 0.48)
        )
          continue;
        sj_pads.push({
          x: sj_x,
          z: sj_z,
          s: sj_s,
          rot: sj_rand.range(0, Math.PI * 2),
          flower: sj_rand.chance(0.22),
        });
      }
    }
    return sj_pads;
  }

  addTo(sj_scene: Scene): void {
    this.lake.addTo(sj_scene);
    this.river.addTo(sj_scene);
    this.waterfall.addTo(sj_scene);
    this.koi.addTo(sj_scene);
    this.lotus.addTo(sj_scene);
  }

  update(
    sj_dt: number,
    sj_time: number,
    sj_player: { position: Vector3; wading: boolean; swimming: boolean; speed: number },
    sj_particleAmount: number,
  ): void {
    this.koi.update(sj_dt, sj_time, sj_player.position);
    this.waterfall.update(sj_dt, this.particles, sj_particleAmount);
    if ((sj_player.wading || sj_player.swimming) && sj_player.speed > 0.4) {
      this.rippleTimer -= sj_dt;
      if (this.rippleTimer <= 0) {
        this.rippleTimer = sj_player.swimming ? 0.45 : 0.32;
        this.lake.ripple(
          sj_player.position.x,
          sj_player.position.z,
          sj_player.swimming ? 0.9 : 0.6,
        );
      }
    }
  }
}
