import { mtof, type AudioCore } from './AudioCore';

const pluckCache = new Map<string, AudioBuffer>();

/**
 * Karplus–Strong plucked string, rendered once per pitch into a buffer. A bright,
 * slowly decaying tone that reads as a zither (guzheng) with the bends applied at playback.
 */
function pluckBuffer(
  core: AudioCore,
  freq: number,
  seconds: number,
  brightness: number,
): AudioBuffer {
  const key = `${freq.toFixed(2)}:${seconds}:${brightness}`;
  const cached = pluckCache.get(key);
  if (cached) return cached;
  const ctx = core.ctx;
  const rate = ctx.sampleRate;
  const n = Math.max(2, Math.round(rate / freq));
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(1, len, rate);
  const out = buf.getChannelData(0);
  const ring = new Float32Array(n);
  // excitation: noise, softened for a rounder attack
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    lp += (w - lp) * brightness;
    ring[i] = lp;
  }
  // loss per period chosen so the note rings for roughly `seconds`
  const periods = (rate * seconds) / n;
  const rho = Math.pow(0.002, 1 / periods);
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const next = idx + 1 === n ? 0 : idx + 1;
    const v = rho * 0.5 * (ring[idx]! + ring[next]!);
    out[i] = ring[idx]!;
    ring[idx] = v;
    idx = next;
  }
  // tiny attack ramp and tail fade to avoid clicks
  const a = Math.floor(rate * 0.002);
  for (let i = 0; i < a; i++) out[i]! *= i / a;
  const f = Math.floor(rate * 0.05);
  for (let i = 0; i < f; i++) out[len - 1 - i]! *= i / f;
  pluckCache.set(key, buf);
  return buf;
}

export interface PluckOptions {
  midi: number;
  time: number;
  volume: number;
  dest: AudioNode;
  pan?: number;
  /** semitones to bend up at the start (press-bend ornament) */
  bend?: number;
  vibrato?: boolean;
  seconds?: number;
  brightness?: number;
}

/** Guzheng-like pluck with optional pitch bend and vibrato. */
export function pluck(core: AudioCore, o: PluckOptions): void {
  const ctx = core.ctx;
  const src = ctx.createBufferSource();
  src.buffer = pluckBuffer(core, mtof(o.midi), o.seconds ?? 3.2, o.brightness ?? 0.55);
  const t = o.time;
  if (o.bend) {
    const ratio = Math.pow(2, o.bend / 12);
    src.playbackRate.setValueAtTime(1 / ratio, t);
    src.playbackRate.setValueAtTime(1 / ratio, t + 0.06);
    src.playbackRate.linearRampToValueAtTime(1, t + 0.22);
  }
  if (o.vibrato) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(14, t + 0.6);
    lfo.connect(depth).connect(src.detune);
    lfo.start(t);
    lfo.stop(t + (o.seconds ?? 3.2));
  }
  // body resonance: gentle low shelf + presence peak
  const body = ctx.createBiquadFilter();
  body.type = 'peaking';
  body.frequency.value = 2400;
  body.Q.value = 0.8;
  body.gain.value = 4;
  const g = core.out(o.dest, o.volume, o.pan ?? 0);
  src.connect(body).connect(g);
  src.start(t);
}

export interface FluteOptions {
  midi: number;
  time: number;
  duration: number;
  volume: number;
  dest: AudioNode;
  pan?: number;
}

/** Breathy bamboo flute: scooped attack, delayed vibrato and filtered breath noise. */
export function flute(core: AudioCore, o: FluteOptions): void {
  const ctx = core.ctx;
  const t = o.time;
  const f = mtof(o.midi);
  const end = t + o.duration;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(f * 0.97, t);
  osc.frequency.exponentialRampToValueAtTime(f, t + 0.09);
  const sine = ctx.createOscillator();
  sine.type = 'sine';
  sine.frequency.setValueAtTime(f * 2 * 0.97, t);
  sine.frequency.exponentialRampToValueAtTime(f * 2, t + 0.09);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.4;
  const vib = ctx.createGain();
  vib.gain.setValueAtTime(0, t);
  vib.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(0.5, o.duration * 0.6));
  lfo.connect(vib);
  vib.connect(osc.frequency);
  vib.connect(sine.frequency);

  const tone = ctx.createGain();
  tone.gain.value = 1;
  const harm = ctx.createGain();
  harm.gain.value = 0.18;
  osc.connect(tone);
  sine.connect(harm).connect(tone);

  const breath = core.noiseSource(true);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = f * 2;
  bp.Q.value = 6;
  const bg = ctx.createGain();
  bg.gain.value = 0.3;
  breath.connect(bp).connect(bg).connect(tone);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3200;
  const env = core.out(o.dest, 0, o.pan ?? 0);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(o.volume, t + 0.12);
  env.gain.setValueAtTime(o.volume, Math.max(t + 0.12, end - 0.3));
  env.gain.exponentialRampToValueAtTime(0.0001, end + 0.25);
  tone.connect(lp).connect(env);
  for (const s of [osc, sine, lfo, breath]) {
    s.start(t);
    s.stop(end + 0.3);
  }
}

export interface BellOptions {
  /** fundamental frequency (Hz) */
  freq: number;
  time: number;
  volume: number;
  dest: AudioNode;
  pan?: number;
  /** seconds for the longest partial */
  length?: number;
  /** partial ratios; defaults to a small temple bell */
  partials?: number[];
}

const TEMPLE_BELL = [0.5, 1, 1.19, 1.5, 2, 2.74, 3.76];
const SMALL_BELL = [1, 2.76, 5.4, 8.93];

/** Additive bell: inharmonic partials with individual decays and slow beating. */
export function bell(core: AudioCore, o: BellOptions): void {
  const ctx = core.ctx;
  const t = o.time;
  const partials = o.partials ?? SMALL_BELL;
  const length = o.length ?? 2.5;
  const out = core.out(o.dest, o.volume, o.pan ?? 0);
  partials.forEach((ratio, i) => {
    for (const detune of [-0.6, 0.6]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = o.freq * ratio + detune * (i + 1) * 0.3;
      const g = ctx.createGain();
      const amp = (1 / (i + 1.3)) * 0.5;
      const decay = length * Math.pow(0.68, i);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + decay + 0.05);
    }
  });
}

/** Deep bronze temple bell (the bell tower). */
export function templeBell(
  core: AudioCore,
  time: number,
  volume: number,
  dest: AudioNode,
  pan = 0,
): void {
  bell(core, { freq: 196, time, volume, dest, pan, length: 9, partials: TEMPLE_BELL });
  // strike transient
  const ctx = core.ctx;
  const n = core.noiseSource();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const g = core.out(dest, 0, pan);
  core.envelope(g.gain, time, volume * 0.8, 0.003, 0.12);
  n.connect(lp).connect(g);
  n.start(time, Math.random());
  n.stop(time + 0.2);
}

/** Hollow wooden block tock. */
export function woodblock(
  core: AudioCore,
  time: number,
  volume: number,
  dest: AudioNode,
  freq = 900,
  pan = 0,
): void {
  const ctx = core.ctx;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq * 1.3, time);
  osc.frequency.exponentialRampToValueAtTime(freq, time + 0.02);
  const g = core.out(dest, 0, pan);
  core.envelope(g.gain, time, volume, 0.001, 0.09);
  osc.connect(g);
  osc.start(time);
  osc.stop(time + 0.15);
}

/** Big barrel drum: pitched thump, low body and skin slap. */
export function bigDrum(
  core: AudioCore,
  time: number,
  volume: number,
  dest: AudioNode,
  pan = 0,
): void {
  const ctx = core.ctx;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, time);
  osc.frequency.exponentialRampToValueAtTime(52, time + 0.18);
  const g = core.out(dest, 0, pan);
  core.envelope(g.gain, time, volume, 0.003, 0.9);
  osc.connect(g);
  osc.start(time);
  osc.stop(time + 1);
  const n = core.noiseSource();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1100;
  bp.Q.value = 1.2;
  const ng = core.out(dest, 0, pan);
  core.envelope(ng.gain, time, volume * 0.45, 0.001, 0.08);
  n.connect(bp).connect(ng);
  n.start(time, Math.random());
  n.stop(time + 0.12);
}
