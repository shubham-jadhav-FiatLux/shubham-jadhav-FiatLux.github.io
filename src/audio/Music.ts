import type { AudioCore } from './AudioCore';
import { bell, flute, pluck } from './instruments';
import { Random } from '../utils/random';

/** D major pentatonic (D E F♯ A B) across the usable range, as MIDI numbers. */
const SCALE: number[] = [];
for (let m = 38; m <= 88; m++) {
  if ([0, 2, 4, 7, 9].includes((((m - 62) % 12) + 12) % 12)) SCALE.push(m);
}
const idxOf = (midi: number) => {
  let best = 0;
  for (let i = 0; i < SCALE.length; i++)
    if (Math.abs(SCALE[i]! - midi) < Math.abs(SCALE[best]! - midi)) best = i;
  return best;
};

/** Rhythms for a two-bar phrase, in eighth notes; negative values are rests. */
const RHYTHMS: number[][] = [
  [2, 1, 1, 2, 2, 6, -2],
  [3, 1, 2, 2, 4, -4],
  [1, 1, 2, 1, 1, 2, 4, -4],
  [4, 2, 2, 6, -2],
  [2, 2, 1, 1, 2, 8],
  [-2, 2, 1, 1, 4, 4, -2],
  [1, 1, 1, 1, 2, 2, 6, -2],
];

/** Harmonic roots (MIDI, bass register) cycling every two bars. */
const PROGRESSIONS: number[][] = [
  [38, 47, 45, 38],
  [38, 40, 47, 45],
  [47, 45, 38, 38],
  [38, 45, 47, 40],
];

type Lead = 'pluck' | 'flute' | 'none';

interface Section {
  bars: number;
  lead: Lead;
  arp: number;
  progression: number[];
}

/**
 * Generative score: rolling zither arpeggios over a slow pentatonic bass, answered by
 * plucked or flute melodies built from call-and-response phrases. It is composed two bars
 * at a time, so it never repeats exactly.
 */
export class Music {
  private rand = new Random((Date.now() & 0xffff) + 7);
  private nextBlock = 0;
  private blockIndex = 0;
  private section: Section;
  private sectionBlocks = 0;
  private lastMelody = 74;
  private lastRhythm: number[] = RHYTHMS[0]!;
  private eighth = 60 / 70 / 2;
  running = false;

  constructor(private readonly core: AudioCore) {
    this.section = this.newSection(true);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.nextBlock = this.core.now + 0.8;
  }

  stop(): void {
    this.running = false;
  }

  private newSection(first = false): Section {
    const leads: Lead[] = ['pluck', 'flute', 'pluck', 'none'];
    return {
      bars: 8,
      lead: first ? 'none' : this.rand.pick(leads),
      arp: first ? 0.55 : this.rand.range(0.5, 1),
      progression: this.rand.pick(PROGRESSIONS),
    };
  }

  /** Schedule ahead; call every frame. */
  update(): void {
    if (!this.running) return;
    const now = this.core.now;
    if (this.nextBlock < now - 1) this.nextBlock = now + 0.1; // resumed after a pause
    while (this.nextBlock < now + 0.6) {
      this.composeBlock(this.nextBlock);
      this.nextBlock += this.eighth * 16;
    }
  }

  /** Two bars: bass, arpeggio bed and (maybe) a melodic phrase. */
  private composeBlock(t0: number): void {
    const core = this.core;
    const dest = core.music;
    const e = this.eighth;
    const s = this.section;
    const root = s.progression[this.blockIndex % s.progression.length]!;

    // section start: a gentle bell and an upward glissando
    if (this.sectionBlocks === 0) {
      bell(core, {
        freq: 1175,
        time: t0,
        volume: 0.035,
        dest,
        length: 3,
        pan: this.rand.spread(0.5),
      });
      if (this.rand.chance(0.7)) {
        const start = idxOf(root + 24);
        for (let k = 0; k < 7; k++) {
          pluck(core, {
            midi: SCALE[Math.min(SCALE.length - 1, start + k)]!,
            time: t0 + k * 0.055,
            volume: 0.09 + k * 0.01,
            dest,
            pan: -0.3 + k * 0.1,
            seconds: 2.4,
          });
        }
      }
    }

    // bass: root on the downbeat of each bar, fifth-ish on beat three
    for (let bar = 0; bar < 2; bar++) {
      const tb = t0 + bar * 8 * e;
      pluck(core, {
        midi: root,
        time: tb,
        volume: 0.34,
        dest,
        pan: -0.15,
        seconds: 4,
        brightness: 0.35,
      });
      if (this.rand.chance(0.6)) {
        pluck(core, {
          midi: SCALE[idxOf(root) + 3]!,
          time: tb + 4 * e,
          volume: 0.12,
          dest,
          pan: -0.1,
          seconds: 3,
          brightness: 0.35,
        });
      }
    }

    // rolling arpeggio bed (guzheng style: up and back down through the pentatonic)
    const base = idxOf(root + 12);
    const shapes = [
      [0, 2, 4, 5, 7, 5, 4, 2],
      [0, 3, 5, 7, 5, 3, 2, 3],
      [0, 2, 3, 5, 3, 2, 4, 2],
    ];
    const shape = this.rand.pick(shapes);
    for (let k = 0; k < 16; k++) {
      if (!this.rand.chance(s.arp)) continue;
      const deg = shape[k % shape.length]!;
      const midi = SCALE[Math.min(SCALE.length - 1, base + deg)]!;
      const accent = k % 4 === 0 ? 1.25 : 1;
      pluck(core, {
        midi,
        time: t0 + k * e + this.rand.range(0, 0.012),
        volume: 0.13 * accent,
        dest,
        pan: 0.25 * Math.sin(k * 0.8),
        seconds: 2.6,
        brightness: 0.5,
      });
    }

    // melody: call on even blocks, varied answer on odd blocks
    if (s.lead !== 'none') {
      const answer = this.blockIndex % 2 === 1;
      const rhythm = answer ? this.lastRhythm : this.rand.pick(RHYTHMS);
      this.lastRhythm = rhythm;
      let i = idxOf(this.lastMelody);
      let step = 0;
      const notes = rhythm.filter((d) => d > 0).length;
      let n = 0;
      for (const d of rhythm) {
        if (d < 0) {
          step += -d;
          continue;
        }
        n++;
        const last = n === notes;
        if (last) {
          // resolve to D or A
          const targets = SCALE.map((m, k) => ({ m, k })).filter(
            ({ m }) => (m - 62) % 12 === 0 || (m - 69) % 12 === 0,
          );
          const near = targets.reduce((a, b) => (Math.abs(b.k - i) < Math.abs(a.k - i) ? b : a));
          i = near.k;
        } else {
          const r = this.rand.float();
          i += r < 0.15 ? -2 : r < 0.45 ? -1 : r < 0.55 ? 0 : r < 0.85 ? 1 : 2;
        }
        const lo = idxOf(s.lead === 'flute' ? 69 : 66);
        const hi = idxOf(s.lead === 'flute' ? 88 : 86);
        i = Math.max(lo, Math.min(hi, i));
        const midi = SCALE[i]!;
        const time = t0 + step * e;
        if (s.lead === 'flute') {
          flute(core, { midi, time, duration: d * e * 0.95, volume: 0.12, dest, pan: 0.2 });
        } else {
          pluck(core, {
            midi,
            time,
            volume: 0.34,
            dest,
            pan: 0.12,
            bend: d >= 4 && this.rand.chance(0.5) ? 2 : 0,
            vibrato: d >= 3,
            seconds: 3.4,
            brightness: 0.62,
          });
        }
        this.lastMelody = midi;
        step += d;
      }
    }

    this.blockIndex++;
    this.sectionBlocks++;
    if (this.sectionBlocks * 2 >= s.bars) {
      this.section = this.newSection();
      this.sectionBlocks = 0;
    }
  }
}
