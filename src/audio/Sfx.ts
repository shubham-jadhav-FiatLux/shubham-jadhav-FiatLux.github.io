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
}

const r = (a: number, b: number) => a + Math.random() * (b - a);

/** Every one-shot sound effect, synthesised on the fly. */
export class Sfx {
  constructor(private readonly core: AudioCore) {}

  /** Filtered noise burst: the building block of steps, splashes and whooshes. */
  private noise(
    t: number,
    dest: AudioNode,
    o: {
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
    const ctx = this.core.ctx;
    const src = this.core.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = o.type;
    f.frequency.setValueAtTime(o.freq, t);
    if (o.sweepTo)
      f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + (o.attack ?? 0.005) + o.decay);
    f.Q.value = o.q ?? 1;
    const g = this.core.out(dest, 0, o.pan ?? 0);
    this.core.envelope(g.gain, t, o.volume, o.attack ?? 0.005, o.decay);
    src.connect(f).connect(g);
    src.start(t, Math.random() * 1.5);
    src.stop(t + (o.attack ?? 0.005) + o.decay + 0.05);
  }

  private tone(
    t: number,
    dest: AudioNode,
    o: {
      freq: number;
      to?: number;
      volume: number;
      decay: number;
      type?: OscillatorType;
      pan?: number;
    },
  ): void {
    const ctx = this.core.ctx;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.decay);
    const g = this.core.out(dest, 0, o.pan ?? 0);
    this.core.envelope(g.gain, t, o.volume, 0.003, o.decay);
    osc.connect(g);
    osc.start(t);
    osc.stop(t + o.decay + 0.05);
  }

  /** Little bubbles for water sounds. */
  private bubbles(t: number, dest: AudioNode, count: number, volume: number, pan = 0): void {
    for (let i = 0; i < count; i++) {
      const tt = t + r(0, 0.25);
      const f = r(500, 1400);
      this.tone(tt, dest, {
        freq: f,
        to: f * r(1.3, 1.8),
        volume: volume * r(0.4, 1),
        decay: r(0.03, 0.07),
        pan,
      });
    }
  }

  footstep(surface: Surface, run: boolean, volume = 1): void {
    const t = this.core.now;
    const d = this.core.sfx;
    const v = (run ? 0.55 : 0.4) * volume;
    const p = r(-0.08, 0.08);
    switch (surface) {
      case 'grass':
        this.noise(t, d, {
          type: 'bandpass',
          freq: r(1600, 2300),
          q: 0.7,
          volume: v * 0.5,
          decay: run ? 0.07 : 0.1,
          pan: p,
        });
        this.tone(t, d, { freq: r(90, 120), to: 60, volume: v * 0.35, decay: 0.06, pan: p });
        break;
      case 'dirt':
      case 'sand':
        this.noise(t, d, {
          type: 'bandpass',
          freq: r(700, 1100),
          q: 0.9,
          volume: v * 0.6,
          decay: 0.09,
          pan: p,
        });
        this.noise(t + 0.02, d, {
          type: 'highpass',
          freq: 3000,
          volume: v * 0.15,
          decay: 0.04,
          pan: p,
        });
        break;
      case 'stone':
        this.noise(t, d, {
          type: 'highpass',
          freq: r(2400, 3200),
          volume: v * 0.35,
          decay: 0.04,
          pan: p,
        });
        this.tone(t, d, { freq: r(320, 420), to: 200, volume: v * 0.3, decay: 0.05, pan: p });
        break;
      case 'wood':
        this.tone(t, d, { freq: r(190, 240), to: 150, volume: v * 0.6, decay: 0.09, pan: p });
        this.noise(t, d, {
          type: 'bandpass',
          freq: 900,
          q: 2,
          volume: v * 0.3,
          decay: 0.05,
          pan: p,
        });
        break;
      case 'water':
        this.noise(t, d, {
          type: 'bandpass',
          freq: r(900, 1400),
          q: 0.8,
          volume: v * 0.55,
          decay: 0.16,
          pan: p,
        });
        this.bubbles(t, d, 3, v * 0.25, p);
        break;
    }
  }

  play(name: SfxName, o: SfxOptions = {}): void {
    const core = this.core;
    const t = core.now;
    const [dist, pan] = core.spatial(o.x, o.z);
    const v = (o.volume ?? 1) * dist;
    const d = core.sfx;
    switch (name) {
      case 'jump':
        this.noise(t, d, {
          type: 'bandpass',
          freq: 500,
          sweepTo: 1600,
          q: 1.2,
          volume: 0.35 * v,
          attack: 0.03,
          decay: 0.18,
        });
        this.tone(t, d, { freq: 260, to: 420, volume: 0.05 * v, decay: 0.12 });
        break;
      case 'land':
        this.tone(t, d, { freq: 110, to: 45, volume: 0.45 * v + 0.1, decay: 0.16 });
        this.noise(t, d, { type: 'lowpass', freq: 600, volume: 0.25 * v + 0.05, decay: 0.12 });
        break;
      case 'splash':
        this.noise(t, d, {
          type: 'bandpass',
          freq: 900,
          sweepTo: 500,
          q: 0.7,
          volume: 0.5 * v,
          attack: 0.01,
          decay: 0.45,
          pan,
        });
        this.noise(t, d, { type: 'highpass', freq: 2500, volume: 0.2 * v, decay: 0.3, pan });
        this.bubbles(t + 0.05, d, 8, 0.12 * v, pan);
        break;
      case 'swim':
        this.noise(t, d, {
          type: 'bandpass',
          freq: 650,
          q: 1,
          volume: 0.18 * v,
          attack: 0.03,
          decay: 0.2,
        });
        this.bubbles(t, d, 2, 0.06 * v);
        break;
      case 'whoosh':
        this.noise(t, d, {
          type: 'bandpass',
          freq: 350,
          sweepTo: 2600,
          q: 1.4,
          volume: 0.85 * v,
          attack: 0.09,
          decay: 0.28,
        });
        this.noise(t + 0.12, d, {
          type: 'bandpass',
          freq: 2200,
          sweepTo: 700,
          q: 1.2,
          volume: 0.4 * v,
          attack: 0.03,
          decay: 0.2,
        });
        break;
      case 'thwack':
        this.tone(t, d, { freq: 190, to: 140, volume: 0.6 * v, decay: 0.18, pan });
        this.tone(t, d, { freq: 520, to: 430, volume: 0.25 * v, decay: 0.1, pan });
        this.noise(t, d, {
          type: 'bandpass',
          freq: 2000,
          q: 1.5,
          volume: 0.35 * v,
          decay: 0.04,
          pan,
        });
        this.noise(t, d, { type: 'bandpass', freq: 700, q: 9, volume: 0.25 * v, decay: 0.2, pan });
        break;
      case 'drum':
        bigDrum(core, t, 0.9 * v, d, pan);
        break;
      case 'gong':
        templeBell(core, t, 0.55 * Math.max(v, 0.5), d, pan);
        break;
      case 'discover': {
        // The discovery sting: an airy whoosh, a rising zither glissando, a bright bell.
        this.noise(t, d, {
          type: 'bandpass',
          freq: 300,
          sweepTo: 4000,
          q: 1.1,
          volume: 0.55,
          attack: 0.25,
          decay: 0.45,
        });
        const notes = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86];
        notes.forEach((m, i) =>
          pluck(core, {
            midi: m,
            time: t + 0.18 + i * 0.045,
            volume: 0.22 + i * 0.018,
            dest: d,
            pan: -0.5 + i * 0.1,
            seconds: 2.8,
            brightness: 0.7,
          }),
        );
        bell(core, { freq: 1480, time: t + 0.72, volume: 0.2, dest: d, length: 3.4 });
        bell(core, { freq: 740, time: t + 0.72, volume: 0.16, dest: d, length: 4.5 });
        templeBell(core, t + 0.7, 0.26, d);
        break;
      }
      case 'open':
        this.noise(t, d, {
          type: 'bandpass',
          freq: 3500,
          q: 0.6,
          volume: 0.12,
          attack: 0.05,
          decay: 0.35,
        });
        for (let i = 0; i < 6; i++)
          this.noise(t + r(0, 0.4), d, {
            type: 'highpass',
            freq: 4000,
            volume: 0.05,
            decay: 0.015,
          });
        pluck(core, { midi: 74, time: t + 0.05, volume: 0.1, dest: d, seconds: 1.8 });
        break;
      case 'close':
        this.noise(t, d, {
          type: 'bandpass',
          freq: 2800,
          q: 0.6,
          volume: 0.08,
          attack: 0.02,
          decay: 0.2,
        });
        woodblock(core, t + 0.12, 0.12, d, 620);
        break;
      case 'ui':
        woodblock(core, t, 0.1, d, 1100);
        break;
      case 'travel':
        this.noise(t, d, {
          type: 'bandpass',
          freq: 200,
          sweepTo: 3000,
          q: 0.9,
          volume: 0.3,
          attack: 0.3,
          decay: 0.3,
        });
        bell(core, { freq: 1760, time: t + 0.35, volume: 0.07, dest: d, length: 2 });
        break;
      case 'chime':
        bell(core, { freq: 1318, time: t, volume: 0.07, dest: d, length: 4 });
        bell(core, { freq: 988, time: t + 0.6, volume: 0.05, dest: d, length: 4 });
        break;
      case 'rustle':
        for (let i = 0; i < 4; i++) {
          this.noise(t + i * r(0.04, 0.09), d, {
            type: 'highpass',
            freq: r(2500, 4500),
            volume: 0.08 * v,
            decay: r(0.06, 0.12),
            pan: r(-0.3, 0.3),
          });
        }
        break;
    }
  }
}
