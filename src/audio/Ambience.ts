import type { AudioCore } from './AudioCore';
import { bell } from './instruments';
import { lakeSdf } from '../world/heightfield';
import { sj_PLACES } from '../world/layout';
import { smoothstep } from '../utils/math';

interface Bed {
  gain: GainNode;
  filter: BiquadFilterNode;
  pan?: StereoPannerNode;
}

/**
 * The valley's soundscape: wind with gusts in two stereo layers, water lapping near the
 * lake, the roar of the waterfall (positional), birdsong and wind bells by the pagoda.
 */
export class Ambience {
  private wind: Bed[] = [];
  private water: Bed;
  private falls: Bed;
  private birdTimer = 2;
  private bellTimer = 4;
  private time = 0;

  constructor(private readonly core: AudioCore) {
    for (const sj_side of [-0.6, 0.6]) {
      this.wind.push(this.bed('lowpass', 500, 0.7, sj_side));
    }
    this.water = this.bed('bandpass', 480, 0.8, 0);
    this.falls = this.bed('bandpass', 700, 0.35, 0);
  }

  private bed(sj_type: BiquadFilterType, sj_freq: number, sj_q: number, sj_pan: number): Bed {
    const sj_ctx = this.core.ctx;
    const sj_src = this.core.noiseSource(true);
    const sj_filter = sj_ctx.createBiquadFilter();
    sj_filter.type = sj_type;
    sj_filter.frequency.value = sj_freq;
    sj_filter.Q.value = sj_q;
    const sj_gain = sj_ctx.createGain();
    sj_gain.gain.value = 0;
    sj_src.connect(sj_filter).connect(sj_gain);
    let sj_p: StereoPannerNode | undefined;
    if (sj_ctx.createStereoPanner) {
      sj_p = sj_ctx.createStereoPanner();
      sj_p.pan.value = sj_pan;
      sj_gain.connect(sj_p).connect(this.core.ambience);
    } else {
      sj_gain.connect(this.core.ambience);
    }
    sj_src.start(0, Math.random() * 1.5);
    return { gain: sj_gain, filter: sj_filter, pan: sj_p };
  }

  update(
    sj_dt: number,
    sj_player: { x: number; z: number },
    sj_waterfall: { x: number; z: number },
    sj_calm: boolean,
  ): void {
    const sj_core = this.core;
    const sj_t = sj_core.now;
    this.time += sj_dt;
    const sj_s = this.time;
    const sj_smooth = 0.25;

    // wind: slow gusts, a touch brighter when gusty
    this.wind.forEach((sj_w, sj_i) => {
      const sj_gust =
        0.5 + 0.3 * Math.sin(sj_s * 0.21 + sj_i * 2.1) + 0.2 * Math.sin(sj_s * 0.53 + sj_i);
      sj_w.gain.gain.setTargetAtTime((sj_calm ? 0.05 : 0.09) * sj_gust, sj_t, sj_smooth);
      sj_w.filter.frequency.setTargetAtTime(300 + sj_gust * 700, sj_t, sj_smooth);
    });

    // water lapping near the shore
    const sj_sdf = lakeSdf(sj_player.x, sj_player.z);
    const sj_nearLake = 1 - smoothstep(-2, 22, Math.abs(sj_sdf) - (sj_sdf < 0 ? 4 : 0));
    const sj_lap = 0.6 + 0.4 * Math.sin(sj_s * 1.7) * Math.sin(sj_s * 0.63);
    this.water.gain.gain.setTargetAtTime(0.16 * sj_nearLake * sj_lap, sj_t, sj_smooth);

    // waterfall roar, panned towards the falls
    const [sj_g, sj_pan] = sj_core.spatial(sj_waterfall.x, sj_waterfall.z, 10);
    this.falls.gain.gain.setTargetAtTime(0.4 * sj_g * sj_g, sj_t, sj_smooth);
    this.falls.pan?.pan.setTargetAtTime(sj_pan, sj_t, sj_smooth);

    // birdsong
    this.birdTimer -= sj_dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 1.5 + Math.random() * 5;
      this.bird(sj_calm ? 0.5 : 1);
    }

    // wind bells near the pagoda
    const sj_dp = Math.hypot(sj_player.x - sj_PLACES.pagoda.x, sj_player.z - sj_PLACES.pagoda.z);
    this.bellTimer -= sj_dt;
    if (this.bellTimer <= 0) {
      this.bellTimer = 1.5 + Math.random() * 4;
      const sj_near = 1 - smoothstep(10, 40, sj_dp);
      if (sj_near > 0.02) {
        const [sj_bg, sj_bp] = sj_core.spatial(sj_PLACES.pagoda.x, sj_PLACES.pagoda.z, 14);
        const sj_count = 1 + Math.floor(Math.random() * 3);
        for (let sj_i = 0; sj_i < sj_count; sj_i++) {
          bell(sj_core, {
            freq: [2093, 2349, 2637, 3136][Math.floor(Math.random() * 4)]!,
            time: sj_t + sj_i * (0.12 + Math.random() * 0.2),
            volume: 0.025 * sj_near * Math.max(sj_bg, 0.4),
            dest: sj_core.ambience,
            pan: sj_bp,
            length: 2.2,
          });
        }
      }
    }
  }

  /** A little bird: a few quick FM chirps or a slow whistle, somewhere in the stereo field. */
  private bird(sj_volume: number): void {
    const sj_ctx = this.core.ctx;
    const sj_t = this.core.now;
    const sj_pan = Math.random() * 1.6 - 0.8;
    const sj_species = Math.floor(Math.random() * 3);
    const sj_chirps = sj_species === 2 ? 1 : 2 + Math.floor(Math.random() * 4);
    const sj_base = 2200 + Math.random() * 1800;
    for (let sj_i = 0; sj_i < sj_chirps; sj_i++) {
      const sj_tt = sj_t + sj_i * (sj_species === 0 ? 0.09 : 0.16);
      const sj_len = sj_species === 2 ? 0.55 : 0.06 + Math.random() * 0.05;
      const sj_osc = sj_ctx.createOscillator();
      sj_osc.type = 'sine';
      const sj_mod = sj_ctx.createOscillator();
      sj_mod.frequency.value = 30 + Math.random() * 40;
      const sj_modGain = sj_ctx.createGain();
      sj_modGain.gain.value = sj_species === 1 ? 250 : 80;
      sj_mod.connect(sj_modGain).connect(sj_osc.frequency);
      const sj_f0 = sj_base * (sj_species === 2 ? 0.8 : 1);
      sj_osc.frequency.setValueAtTime(sj_f0, sj_tt);
      sj_osc.frequency.exponentialRampToValueAtTime(
        sj_f0 * (sj_species === 2 ? 1.35 : 1.25),
        sj_tt + sj_len * 0.6,
      );
      sj_osc.frequency.exponentialRampToValueAtTime(sj_f0 * 0.9, sj_tt + sj_len);
      const sj_g = this.core.out(this.core.ambience, 0, sj_pan);
      this.core.envelope(sj_g.gain, sj_tt, 0.03 * sj_volume, 0.01, sj_len);
      sj_osc.connect(sj_g);
      sj_osc.start(sj_tt);
      sj_mod.start(sj_tt);
      sj_osc.stop(sj_tt + sj_len + 0.05);
      sj_mod.stop(sj_tt + sj_len + 0.05);
    }
  }
}
