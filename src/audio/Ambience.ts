import type { AudioCore } from './AudioCore';
import { bell } from './instruments';
import { lakeSdf } from '../world/heightfield';
import { PLACES } from '../world/layout';
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
    for (const side of [-0.6, 0.6]) {
      this.wind.push(this.bed('lowpass', 500, 0.7, side));
    }
    this.water = this.bed('bandpass', 480, 0.8, 0);
    this.falls = this.bed('bandpass', 700, 0.35, 0);
  }

  private bed(type: BiquadFilterType, freq: number, q: number, pan: number): Bed {
    const ctx = this.core.ctx;
    const src = this.core.noiseSource(true);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain);
    let p: StereoPannerNode | undefined;
    if (ctx.createStereoPanner) {
      p = ctx.createStereoPanner();
      p.pan.value = pan;
      gain.connect(p).connect(this.core.ambience);
    } else {
      gain.connect(this.core.ambience);
    }
    src.start(0, Math.random() * 1.5);
    return { gain, filter, pan: p };
  }

  update(
    dt: number,
    player: { x: number; z: number },
    waterfall: { x: number; z: number },
    calm: boolean,
  ): void {
    const core = this.core;
    const t = core.now;
    this.time += dt;
    const s = this.time;
    const smooth = 0.25;

    // wind: slow gusts, a touch brighter when gusty
    this.wind.forEach((w, i) => {
      const gust = 0.5 + 0.3 * Math.sin(s * 0.21 + i * 2.1) + 0.2 * Math.sin(s * 0.53 + i);
      w.gain.gain.setTargetAtTime((calm ? 0.05 : 0.09) * gust, t, smooth);
      w.filter.frequency.setTargetAtTime(300 + gust * 700, t, smooth);
    });

    // water lapping near the shore
    const sdf = lakeSdf(player.x, player.z);
    const nearLake = 1 - smoothstep(-2, 22, Math.abs(sdf) - (sdf < 0 ? 4 : 0));
    const lap = 0.6 + 0.4 * Math.sin(s * 1.7) * Math.sin(s * 0.63);
    this.water.gain.gain.setTargetAtTime(0.16 * nearLake * lap, t, smooth);

    // waterfall roar, panned towards the falls
    const [g, pan] = core.spatial(waterfall.x, waterfall.z, 10);
    this.falls.gain.gain.setTargetAtTime(0.4 * g * g, t, smooth);
    this.falls.pan?.pan.setTargetAtTime(pan, t, smooth);

    // birdsong
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 1.5 + Math.random() * 5;
      this.bird(calm ? 0.5 : 1);
    }

    // wind bells near the pagoda
    const dp = Math.hypot(player.x - PLACES.pagoda.x, player.z - PLACES.pagoda.z);
    this.bellTimer -= dt;
    if (this.bellTimer <= 0) {
      this.bellTimer = 1.5 + Math.random() * 4;
      const near = 1 - smoothstep(10, 40, dp);
      if (near > 0.02) {
        const [bg, bp] = core.spatial(PLACES.pagoda.x, PLACES.pagoda.z, 14);
        const count = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
          bell(core, {
            freq: [2093, 2349, 2637, 3136][Math.floor(Math.random() * 4)]!,
            time: t + i * (0.12 + Math.random() * 0.2),
            volume: 0.025 * near * Math.max(bg, 0.4),
            dest: core.ambience,
            pan: bp,
            length: 2.2,
          });
        }
      }
    }
  }

  /** A little bird: a few quick FM chirps or a slow whistle, somewhere in the stereo field. */
  private bird(volume: number): void {
    const ctx = this.core.ctx;
    const t = this.core.now;
    const pan = Math.random() * 1.6 - 0.8;
    const species = Math.floor(Math.random() * 3);
    const chirps = species === 2 ? 1 : 2 + Math.floor(Math.random() * 4);
    const base = 2200 + Math.random() * 1800;
    for (let i = 0; i < chirps; i++) {
      const tt = t + i * (species === 0 ? 0.09 : 0.16);
      const len = species === 2 ? 0.55 : 0.06 + Math.random() * 0.05;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const mod = ctx.createOscillator();
      mod.frequency.value = 30 + Math.random() * 40;
      const modGain = ctx.createGain();
      modGain.gain.value = species === 1 ? 250 : 80;
      mod.connect(modGain).connect(osc.frequency);
      const f0 = base * (species === 2 ? 0.8 : 1);
      osc.frequency.setValueAtTime(f0, tt);
      osc.frequency.exponentialRampToValueAtTime(
        f0 * (species === 2 ? 1.35 : 1.25),
        tt + len * 0.6,
      );
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.9, tt + len);
      const g = this.core.out(this.core.ambience, 0, pan);
      this.core.envelope(g.gain, tt, 0.03 * volume, 0.01, len);
      osc.connect(g);
      osc.start(tt);
      mod.start(tt);
      osc.stop(tt + len + 0.05);
      mod.stop(tt + len + 0.05);
    }
  }
}
