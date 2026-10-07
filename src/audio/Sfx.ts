import type { AudioCore } from './AudioCore';
import { bell, bigDrum, pluck, templeBell, woodblock } from './instruments';
import type { Surface } from '../world/layout';

export type SfxName =
  | 'jump'
  | 'land'
  | 'splash'
  | 'whoosh'
  | 'thwack'
  | 'drum'
  | 'gong'
  | 'discover'
  | 'open'
  | 'unroll'
  | 'close'
  | 'ui'
  | 'travel'
  | 'chime'
  | 'swim'
  | 'rustle';

export interface SfxOptions {
  x?: number;
  z?: number;
  volume?: number;
  /** unroll: seconds the scroll flies before it unrolls */
  delay?: number;
}

const sj_r = (sj_a: number, sj_b: number) => sj_a + Math.random() * (sj_b - sj_a);

/** Every one-shot sound effect, synthesised on the fly. */
export class Sfx {
  constructor(private readonly core: AudioCore) {}

  /** Filtered noise burst: the building block of steps, splashes and whooshes. */
  private noise(
    sj_t: number,
    sj_dest: AudioNode,
    sj_o: {
      type: BiquadFilterType;
      freq: number;
      q?: number;
      volume: number;
      attack?: number;
      decay: number;
      pan?: number;
      sweepTo?: number;
    },
  ): void {
    const sj_ctx = this.core.ctx;
    const sj_src = this.core.noiseSource();
    const sj_f = sj_ctx.createBiquadFilter();
    sj_f.type = sj_o.type;
    sj_f.frequency.setValueAtTime(sj_o.freq, sj_t);
    if (sj_o.sweepTo)
      sj_f.frequency.exponentialRampToValueAtTime(
        sj_o.sweepTo,
        sj_t + (sj_o.attack ?? 0.005) + sj_o.decay,
      );
    sj_f.Q.value = sj_o.q ?? 1;
    const sj_g = this.core.out(sj_dest, 0, sj_o.pan ?? 0);
    this.core.envelope(sj_g.gain, sj_t, sj_o.volume, sj_o.attack ?? 0.005, sj_o.decay);
    sj_src.connect(sj_f).connect(sj_g);
    sj_src.start(sj_t, Math.random() * 1.5);
    sj_src.stop(sj_t + (sj_o.attack ?? 0.005) + sj_o.decay + 0.05);
  }

  private tone(
    sj_t: number,
    sj_dest: AudioNode,
    sj_o: {
      freq: number;
      to?: number;
      volume: number;
      decay: number;
      type?: OscillatorType;
      pan?: number;
    },
  ): void {
    const sj_ctx = this.core.ctx;
    const sj_osc = sj_ctx.createOscillator();
    sj_osc.type = sj_o.type ?? 'sine';
    sj_osc.frequency.setValueAtTime(sj_o.freq, sj_t);
    if (sj_o.to) sj_osc.frequency.exponentialRampToValueAtTime(sj_o.to, sj_t + sj_o.decay);
    const sj_g = this.core.out(sj_dest, 0, sj_o.pan ?? 0);
    this.core.envelope(sj_g.gain, sj_t, sj_o.volume, 0.003, sj_o.decay);
    sj_osc.connect(sj_g);
    sj_osc.start(sj_t);
    sj_osc.stop(sj_t + sj_o.decay + 0.05);
  }

  /** Little bubbles for water sounds. */
  private bubbles(
    sj_t: number,
    sj_dest: AudioNode,
    sj_count: number,
    sj_volume: number,
    sj_pan = 0,
  ): void {
    for (let sj_i = 0; sj_i < sj_count; sj_i++) {
      const sj_tt = sj_t + sj_r(0, 0.25);
      const sj_f = sj_r(500, 1400);
      this.tone(sj_tt, sj_dest, {
        freq: sj_f,
        to: sj_f * sj_r(1.3, 1.8),
        volume: sj_volume * sj_r(0.4, 1),
        decay: sj_r(0.03, 0.07),
        pan: sj_pan,
      });
    }
  }

  footstep(sj_surface: Surface, sj_run: boolean, sj_volume = 1): void {
    const sj_t = this.core.now;
    const sj_d = this.core.sfx;
    const sj_v = (sj_run ? 0.55 : 0.4) * sj_volume;
    const sj_p = sj_r(-0.08, 0.08);
    switch (sj_surface) {
      case 'grass':
        this.noise(sj_t, sj_d, {
          type: 'bandpass',
          freq: sj_r(1600, 2300),
          q: 0.7,
          volume: sj_v * 0.5,
          decay: sj_run ? 0.07 : 0.1,
          pan: sj_p,
        });
        this.tone(sj_t, sj_d, {
          freq: sj_r(90, 120),
          to: 60,
          volume: sj_v * 0.35,
          decay: 0.06,
          pan: sj_p,
        });
        break;
      case 'dirt':
      case 'sand':
        this.noise(sj_t, sj_d, {
          type: 'bandpass',
          freq: sj_r(700, 1100),
          q: 0.9,
          volume: sj_v * 0.6,
          decay: 0.09,
          pan: sj_p,
        });
        this.noise(sj_t + 0.02, sj_d, {
          type: 'highpass',
          freq: 3000,
          volume: sj_v * 0.15,
          decay: 0.04,
          pan: sj_p,
        });
        break;
      case 'stone':
        this.noise(sj_t, sj_d, {
          type: 'highpass',
          freq: sj_r(2400, 3200),
          volume: sj_v * 0.35,
          decay: 0.04,
          pan: sj_p,
        });
        this.tone(sj_t, sj_d, {
          freq: sj_r(320, 420),
          to: 200,
          volume: sj_v * 0.3,
          decay: 0.05,
          pan: sj_p,
        });
        break;
      case 'wood':
        this.tone(sj_t, sj_d, {
          freq: sj_r(190, 240),
          to: 150,
          volume: sj_v * 0.6,
          decay: 0.09,
          pan: sj_p,
        });
        this.noise(sj_t, sj_d, {
          type: 'bandpass',
          freq: 900,
          q: 2,
          volume: sj_v * 0.3,
          decay: 0.05,
          pan: sj_p,
        });
        break;
      case 'water':
        this.noise(sj_t, sj_d, {
          type: 'bandpass',
          freq: sj_r(900, 1400),
          q: 0.8,
          volume: sj_v * 0.55,
          decay: 0.16,
          pan: sj_p,
        });
        this.bubbles(sj_t, sj_d, 3, sj_v * 0.25, sj_p);
        break;
    }
  }

  play(sj_name: SfxName, sj_o: SfxOptions = {}): void {
    const sj_core = this.core;
    const sj_t = sj_core.now;
    const [sj_dist, sj_pan] = sj_core.spatial(sj_o.x, sj_o.z);
    const sj_v = (sj_o.volume ?? 1) * sj_dist;
    const sj_d = sj_core.sfx;
    switch (sj_name) {
      case 'jump':
        this.noise(sj_t, sj_d, {
          type: 'bandpass',
          freq: 500,
          sweepTo: 1600,
          q: 1.2,
          volume: 0.35 * sj_v,
          attack: 0.03,
          decay: 0.18,
        });
        this.tone(sj_t, sj_d, { freq: 260, to: 420, volume: 0.05 * sj_v, decay: 0.12 });
        break;
      case 'land':
        this.tone(sj_t, sj_d, { freq: 110, to: 45, volume: 0.45 * sj_v + 0.1, decay: 0.16 });
        this.noise(sj_t, sj_d, {
          type: 'lowpass',
          freq: 600,
          volume: 0.25 * sj_v + 0.05,
          decay: 0.12,
        });
        break;
      case 'splash':
        this.noise(sj_t, sj_d, {
          type: 'bandpass',
          freq: 900,
          sweepTo: 500,
          q: 0.7,
          volume: 0.5 * sj_v,
          attack: 0.01,
          decay: 0.45,
          pan: sj_pan,
        });
        this.noise(sj_t, sj_d, {
          type: 'highpass',
          freq: 2500,
          volume: 0.2 * sj_v,
          decay: 0.3,
          pan: sj_pan,
        });
        this.bubbles(sj_t + 0.05, sj_d, 8, 0.12 * sj_v, sj_pan);
        break;
      case 'swim':
        this.noise(sj_t, sj_d, {
          type: 'bandpass',
          freq: 650,
          q: 1,
          volume: 0.18 * sj_v,
          attack: 0.03,
          decay: 0.2,
        });
        this.bubbles(sj_t, sj_d, 2, 0.06 * sj_v);
        break;
      case 'whoosh':
        this.noise(sj_t, sj_d, {
          type: 'bandpass',
          freq: 350,
          sweepTo: 2600,
          q: 1.4,
          volume: 0.85 * sj_v,
          attack: 0.09,
          decay: 0.28,
        });
        this.noise(sj_t + 0.12, sj_d, {
          type: 'bandpass',
          freq: 2200,
          sweepTo: 700,
          q: 1.2,
          volume: 0.4 * sj_v,
          attack: 0.03,
          decay: 0.2,
        });
        break;
      case 'thwack':
        this.tone(sj_t, sj_d, { freq: 190, to: 140, volume: 0.6 * sj_v, decay: 0.18, pan: sj_pan });
        this.tone(sj_t, sj_d, { freq: 520, to: 430, volume: 0.25 * sj_v, decay: 0.1, pan: sj_pan });
        this.noise(sj_t, sj_d, {
          type: 'bandpass',
          freq: 2000,
          q: 1.5,
          volume: 0.35 * sj_v,
          decay: 0.04,
          pan: sj_pan,
        });
        this.noise(sj_t, sj_d, {
          type: 'bandpass',
          freq: 700,
          q: 9,
          volume: 0.25 * sj_v,
          decay: 0.2,
          pan: sj_pan,
        });
        break;
      case 'drum':
        // a big drum carries across the yard: distance softens it less than most sounds
        bigDrum(sj_core, sj_t, 1.35 * Math.max(sj_v, 0.65), sj_d, sj_pan);
        break;
      case 'gong':
        templeBell(sj_core, sj_t, 0.55 * Math.max(sj_v, 0.5), sj_d, sj_pan);
        break;
      case 'discover': {
        // The discovery sting: an airy whoosh, a rising zither glissando, a bright bell.
        this.noise(sj_t, sj_d, {
          type: 'bandpass',
          freq: 300,
          sweepTo: 4000,
          q: 1.1,
          volume: 0.55,
          attack: 0.25,
          decay: 0.45,
        });
        const sj_notes = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86];
        sj_notes.forEach((sj_m, sj_i) =>
          pluck(sj_core, {
            midi: sj_m,
            time: sj_t + 0.18 + sj_i * 0.045,
            volume: 0.22 + sj_i * 0.018,
            dest: sj_d,
            pan: -0.5 + sj_i * 0.1,
            seconds: 2.8,
            brightness: 0.7,
          }),
        );
        bell(sj_core, { freq: 1480, time: sj_t + 0.72, volume: 0.2, dest: sj_d, length: 3.4 });
        bell(sj_core, { freq: 740, time: sj_t + 0.72, volume: 0.16, dest: sj_d, length: 4.5 });
        templeBell(sj_core, sj_t + 0.7, 0.26, sj_d);
        break;
      }
      case 'open':
        this.noise(sj_t, sj_d, {
          type: 'bandpass',
          freq: 3500,
          q: 0.6,
          volume: 0.12,
          attack: 0.05,
          decay: 0.35,
        });
        for (let sj_i = 0; sj_i < 6; sj_i++)
          this.noise(sj_t + sj_r(0, 0.4), sj_d, {
            type: 'highpass',
            freq: 4000,
            volume: 0.05,
            decay: 0.015,
          });
        pluck(sj_core, { midi: 74, time: sj_t + 0.05, volume: 0.1, dest: sj_d, seconds: 1.8 });
        break;
      case 'unroll': {
        // "Schedushh": a whoosh as the scroll flies out (sche-), its rollers knocking
        // apart (-du-) and the paper unfurling with a long, crisp rustle (-shhh).
        const sj_fly = Math.max(0.08, sj_o.delay ?? 0.12);
        this.noise(sj_t, sj_d, {
          type: 'bandpass',
          freq: 420,
          sweepTo: 3600,
          q: 1.1,
          volume: 0.42,
          attack: Math.min(0.3, sj_fly * 0.6),
          decay: Math.max(0.1, sj_fly * 0.5),
        });
        this.noise(sj_t, sj_d, {
          type: 'highpass',
          freq: 5200,
          volume: 0.07,
          attack: Math.min(0.3, sj_fly * 0.6),
          decay: 0.12,
        });
        const sj_u = sj_t + sj_fly;
        this.tone(sj_u, sj_d, { freq: 210, to: 92, volume: 0.32, decay: 0.13 });
        woodblock(sj_core, sj_u + 0.012, 0.16, sj_d, 520);
        this.noise(sj_u, sj_d, {
          type: 'highpass',
          freq: 2300,
          sweepTo: 6500,
          volume: 0.34,
          attack: 0.025,
          decay: 1.0,
        });
        this.noise(sj_u, sj_d, {
          type: 'bandpass',
          freq: 1350,
          q: 0.7,
          volume: 0.17,
          attack: 0.02,
          decay: 0.55,
        });
        for (let sj_i = 0; sj_i < 12; sj_i++)
          this.noise(sj_u + sj_r(0.03, 0.72), sj_d, {
            type: 'highpass',
            freq: sj_r(3500, 6000),
            volume: sj_r(0.05, 0.11),
            decay: sj_r(0.01, 0.025),
          });
        pluck(sj_core, { midi: 74, time: sj_u + 0.3, volume: 0.07, dest: sj_d, seconds: 1.8 });
        break;
      }
      case 'close':
        this.noise(sj_t, sj_d, {
          type: 'bandpass',
          freq: 2800,
          q: 0.6,
          volume: 0.08,
          attack: 0.02,
          decay: 0.2,
        });
        woodblock(sj_core, sj_t + 0.12, 0.12, sj_d, 620);
        break;
      case 'ui':
        woodblock(sj_core, sj_t, 0.1, sj_d, 1100);
        break;
      case 'travel':
        this.noise(sj_t, sj_d, {
          type: 'bandpass',
          freq: 200,
          sweepTo: 3000,
          q: 0.9,
          volume: 0.3,
          attack: 0.3,
          decay: 0.3,
        });
        bell(sj_core, { freq: 1760, time: sj_t + 0.35, volume: 0.07, dest: sj_d, length: 2 });
        break;
      case 'chime':
        bell(sj_core, { freq: 1318, time: sj_t, volume: 0.07, dest: sj_d, length: 4 });
        bell(sj_core, { freq: 988, time: sj_t + 0.6, volume: 0.05, dest: sj_d, length: 4 });
        break;
      case 'rustle':
        for (let sj_i = 0; sj_i < 4; sj_i++) {
          this.noise(sj_t + sj_i * sj_r(0.04, 0.09), sj_d, {
            type: 'highpass',
            freq: sj_r(2500, 4500),
            volume: 0.08 * sj_v,
            decay: sj_r(0.06, 0.12),
            pan: sj_r(-0.3, 0.3),
          });
        }
        break;
    }
  }
}
