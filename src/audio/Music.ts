import type { AudioCore } from './AudioCore';
import { bell, flute, pluck } from './instruments';
import { Random } from '../utils/random';

/** D major pentatonic (D E F♯ A B) across the usable range, as MIDI numbers. */
const sj_SCALE: number[] = [];
for (let sj_m = 38; sj_m <= 88; sj_m++) {
  if ([0, 2, 4, 7, 9].includes((((sj_m - 62) % 12) + 12) % 12)) sj_SCALE.push(sj_m);
}
const sj_idxOf = (sj_midi: number) => {
  let sj_best = 0;
  for (let sj_i = 0; sj_i < sj_SCALE.length; sj_i++)
    if (Math.abs(sj_SCALE[sj_i]! - sj_midi) < Math.abs(sj_SCALE[sj_best]! - sj_midi))
      sj_best = sj_i;
  return sj_best;
};

/** Rhythms for a two-bar phrase, in eighth notes; negative values are rests. */
const sj_RHYTHMS: number[][] = [
  [2, 1, 1, 2, 2, 6, -2],
  [3, 1, 2, 2, 4, -4],
  [1, 1, 2, 1, 1, 2, 4, -4],
  [4, 2, 2, 6, -2],
  [2, 2, 1, 1, 2, 8],
  [-2, 2, 1, 1, 4, 4, -2],
  [1, 1, 1, 1, 2, 2, 6, -2],
];

/** Harmonic roots (MIDI, bass register) cycling every two bars. */
const sj_PROGRESSIONS: number[][] = [
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
  private lastRhythm: number[] = sj_RHYTHMS[0]!;
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

  private newSection(sj_first = false): Section {
    const sj_leads: Lead[] = ['pluck', 'flute', 'pluck', 'none'];
    return {
      bars: 8,
      lead: sj_first ? 'none' : this.rand.pick(sj_leads),
      arp: sj_first ? 0.55 : this.rand.range(0.5, 1),
      progression: this.rand.pick(sj_PROGRESSIONS),
    };
  }

  /** Schedule ahead; call every frame. */
  update(): void {
    if (!this.running) return;
    const sj_now = this.core.now;
    // Fell behind (a stall or a suspended context): restart the grid instead of playing
    // every overdue note at once.
    if (this.nextBlock < sj_now) this.nextBlock = sj_now + 0.1;
    while (this.nextBlock < sj_now + 0.6) {
      this.composeBlock(this.nextBlock);
      this.nextBlock += this.eighth * 16;
    }
  }

  /** Two bars: bass, arpeggio bed and (maybe) a melodic phrase. */
  private composeBlock(sj_t0: number): void {
    const sj_core = this.core;
    const sj_dest = sj_core.music;
    const sj_e = this.eighth;
    const sj_s = this.section;
    const sj_root = sj_s.progression[this.blockIndex % sj_s.progression.length]!;

    // section start: a gentle bell and an upward glissando
    if (this.sectionBlocks === 0) {
      bell(sj_core, {
        freq: 1175,
        time: sj_t0,
        volume: 0.035,
        dest: sj_dest,
        length: 3,
        pan: this.rand.spread(0.5),
      });
      if (this.rand.chance(0.7)) {
        const sj_start = sj_idxOf(sj_root + 24);
        for (let sj_k = 0; sj_k < 7; sj_k++) {
          pluck(sj_core, {
            midi: sj_SCALE[Math.min(sj_SCALE.length - 1, sj_start + sj_k)]!,
            time: sj_t0 + sj_k * 0.055,
            volume: 0.09 + sj_k * 0.01,
            dest: sj_dest,
            pan: -0.3 + sj_k * 0.1,
            seconds: 2.4,
          });
        }
      }
    }

    // bass: root on the downbeat of each bar, fifth-ish on beat three
    for (let sj_bar = 0; sj_bar < 2; sj_bar++) {
      const sj_tb = sj_t0 + sj_bar * 8 * sj_e;
      pluck(sj_core, {
        midi: sj_root,
        time: sj_tb,
        volume: 0.34,
        dest: sj_dest,
        pan: -0.15,
        seconds: 4,
        brightness: 0.35,
      });
      if (this.rand.chance(0.6)) {
        pluck(sj_core, {
          midi: sj_SCALE[sj_idxOf(sj_root) + 3]!,
          time: sj_tb + 4 * sj_e,
          volume: 0.12,
          dest: sj_dest,
          pan: -0.1,
          seconds: 3,
          brightness: 0.35,
        });
      }
    }

    // rolling arpeggio bed (guzheng style: up and back down through the pentatonic)
    const sj_base = sj_idxOf(sj_root + 12);
    const sj_shapes = [
      [0, 2, 4, 5, 7, 5, 4, 2],
      [0, 3, 5, 7, 5, 3, 2, 3],
      [0, 2, 3, 5, 3, 2, 4, 2],
    ];
    const sj_shape = this.rand.pick(sj_shapes);
    for (let sj_k = 0; sj_k < 16; sj_k++) {
      if (!this.rand.chance(sj_s.arp)) continue;
      const sj_deg = sj_shape[sj_k % sj_shape.length]!;
      const sj_midi = sj_SCALE[Math.min(sj_SCALE.length - 1, sj_base + sj_deg)]!;
      const sj_accent = sj_k % 4 === 0 ? 1.25 : 1;
      pluck(sj_core, {
        midi: sj_midi,
        time: sj_t0 + sj_k * sj_e + this.rand.range(0, 0.012),
        volume: 0.13 * sj_accent,
        dest: sj_dest,
        pan: 0.25 * Math.sin(sj_k * 0.8),
        seconds: 2.6,
        brightness: 0.5,
      });
    }

    // melody: call on even blocks, varied answer on odd blocks
    if (sj_s.lead !== 'none') {
      const sj_answer = this.blockIndex % 2 === 1;
      const sj_rhythm = sj_answer ? this.lastRhythm : this.rand.pick(sj_RHYTHMS);
      this.lastRhythm = sj_rhythm;
      let sj_i = sj_idxOf(this.lastMelody);
      let sj_step = 0;
      const sj_notes = sj_rhythm.filter((sj_d) => sj_d > 0).length;
      let sj_n = 0;
      for (const sj_d of sj_rhythm) {
        if (sj_d < 0) {
          sj_step += -sj_d;
          continue;
        }
        sj_n++;
        const sj_last = sj_n === sj_notes;
        if (sj_last) {
          // resolve to D or A
          const sj_targets = sj_SCALE
            .map((sj_m, sj_k) => ({ m: sj_m, k: sj_k }))
            .filter(({ m: sj_m }) => (sj_m - 62) % 12 === 0 || (sj_m - 69) % 12 === 0);
          const sj_near = sj_targets.reduce((sj_a, sj_b) =>
            Math.abs(sj_b.k - sj_i) < Math.abs(sj_a.k - sj_i) ? sj_b : sj_a,
          );
          sj_i = sj_near.k;
        } else {
          const sj_r = this.rand.float();
          sj_i += sj_r < 0.15 ? -2 : sj_r < 0.45 ? -1 : sj_r < 0.55 ? 0 : sj_r < 0.85 ? 1 : 2;
        }
        const sj_lo = sj_idxOf(sj_s.lead === 'flute' ? 69 : 66);
        const sj_hi = sj_idxOf(sj_s.lead === 'flute' ? 88 : 86);
        sj_i = Math.max(sj_lo, Math.min(sj_hi, sj_i));
        const sj_midi = sj_SCALE[sj_i]!;
        const sj_time = sj_t0 + sj_step * sj_e;
        if (sj_s.lead === 'flute') {
          flute(sj_core, {
            midi: sj_midi,
            time: sj_time,
            duration: sj_d * sj_e * 0.95,
            volume: 0.12,
            dest: sj_dest,
            pan: 0.2,
          });
        } else {
          pluck(sj_core, {
            midi: sj_midi,
            time: sj_time,
            volume: 0.34,
            dest: sj_dest,
            pan: 0.12,
            bend: sj_d >= 4 && this.rand.chance(0.5) ? 2 : 0,
            vibrato: sj_d >= 3,
            seconds: 3.4,
            brightness: 0.62,
          });
        }
        this.lastMelody = sj_midi;
        sj_step += sj_d;
      }
    }

    this.blockIndex++;
    this.sectionBlocks++;
    if (this.sectionBlocks * 2 >= sj_s.bars) {
      this.section = this.newSection();
      this.sectionBlocks = 0;
    }
  }
}
