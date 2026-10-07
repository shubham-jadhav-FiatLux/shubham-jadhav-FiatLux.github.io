import { mtof, type AudioCore } from './AudioCore';

const sj_pluckCache = new Map<string, AudioBuffer>();

/**
 * Karplus–Strong plucked string, rendered once per pitch into a buffer. A bright,
 * slowly decaying tone that reads as a zither (guzheng) with the bends applied at playback.
 */
function pluckBuffer(
  sj_core: AudioCore,
  sj_freq: number,
  sj_seconds: number,
  sj_brightness: number,
): AudioBuffer {
  const sj_key = `${sj_freq.toFixed(2)}:${sj_seconds}:${sj_brightness}`;
  const sj_cached = sj_pluckCache.get(sj_key);
  if (sj_cached) return sj_cached;
  const sj_ctx = sj_core.ctx;
  const sj_rate = sj_ctx.sampleRate;
  const sj_n = Math.max(2, Math.round(sj_rate / sj_freq));
  const sj_len = Math.floor(sj_rate * sj_seconds);
  const sj_buf = sj_ctx.createBuffer(1, sj_len, sj_rate);
  const sj_out = sj_buf.getChannelData(0);
  const sj_ring = new Float32Array(sj_n);
  // excitation: noise, softened for a rounder attack
  let sj_lp = 0;
  for (let sj_i = 0; sj_i < sj_n; sj_i++) {
    const sj_w = Math.random() * 2 - 1;
    sj_lp += (sj_w - sj_lp) * sj_brightness;
    sj_ring[sj_i] = sj_lp;
  }
  // loss per period chosen so the note rings for roughly `seconds`
  const sj_periods = (sj_rate * sj_seconds) / sj_n;
  const sj_rho = Math.pow(0.002, 1 / sj_periods);
  let sj_idx = 0;
  for (let sj_i = 0; sj_i < sj_len; sj_i++) {
    const sj_next = sj_idx + 1 === sj_n ? 0 : sj_idx + 1;
    const sj_v = sj_rho * 0.5 * (sj_ring[sj_idx]! + sj_ring[sj_next]!);
    sj_out[sj_i] = sj_ring[sj_idx]!;
    sj_ring[sj_idx] = sj_v;
    sj_idx = sj_next;
  }
  // tiny attack ramp and tail fade to avoid clicks
  const sj_a = Math.floor(sj_rate * 0.002);
  for (let sj_i = 0; sj_i < sj_a; sj_i++) sj_out[sj_i]! *= sj_i / sj_a;
  const sj_f = Math.floor(sj_rate * 0.05);
  for (let sj_i = 0; sj_i < sj_f; sj_i++) sj_out[sj_len - 1 - sj_i]! *= sj_i / sj_f;
  sj_pluckCache.set(sj_key, sj_buf);
  return sj_buf;
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
export function pluck(sj_core: AudioCore, sj_o: PluckOptions): void {
  const sj_ctx = sj_core.ctx;
  const sj_src = sj_ctx.createBufferSource();
  sj_src.buffer = pluckBuffer(
    sj_core,
    mtof(sj_o.midi),
    sj_o.seconds ?? 3.2,
    sj_o.brightness ?? 0.55,
  );
  const sj_t = sj_o.time;
  if (sj_o.bend) {
    const sj_ratio = Math.pow(2, sj_o.bend / 12);
    sj_src.playbackRate.setValueAtTime(1 / sj_ratio, sj_t);
    sj_src.playbackRate.setValueAtTime(1 / sj_ratio, sj_t + 0.06);
    sj_src.playbackRate.linearRampToValueAtTime(1, sj_t + 0.22);
  }
  if (sj_o.vibrato) {
    const sj_lfo = sj_ctx.createOscillator();
    sj_lfo.frequency.value = 5.2;
    const sj_depth = sj_ctx.createGain();
    sj_depth.gain.setValueAtTime(0, sj_t);
    sj_depth.gain.linearRampToValueAtTime(14, sj_t + 0.6);
    sj_lfo.connect(sj_depth).connect(sj_src.detune);
    sj_lfo.start(sj_t);
    sj_lfo.stop(sj_t + (sj_o.seconds ?? 3.2));
  }
  // body resonance: gentle low shelf + presence peak
  const sj_body = sj_ctx.createBiquadFilter();
  sj_body.type = 'peaking';
  sj_body.frequency.value = 2400;
  sj_body.Q.value = 0.8;
  sj_body.gain.value = 4;
  const sj_g = sj_core.out(sj_o.dest, sj_o.volume, sj_o.pan ?? 0);
  sj_src.connect(sj_body).connect(sj_g);
  sj_src.start(sj_t);
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
export function flute(sj_core: AudioCore, sj_o: FluteOptions): void {
  const sj_ctx = sj_core.ctx;
  const sj_t = sj_o.time;
  const sj_f = mtof(sj_o.midi);
  const sj_end = sj_t + sj_o.duration;
  const sj_osc = sj_ctx.createOscillator();
  sj_osc.type = 'triangle';
  sj_osc.frequency.setValueAtTime(sj_f * 0.97, sj_t);
  sj_osc.frequency.exponentialRampToValueAtTime(sj_f, sj_t + 0.09);
  const sj_sine = sj_ctx.createOscillator();
  sj_sine.type = 'sine';
  sj_sine.frequency.setValueAtTime(sj_f * 2 * 0.97, sj_t);
  sj_sine.frequency.exponentialRampToValueAtTime(sj_f * 2, sj_t + 0.09);
  const sj_lfo = sj_ctx.createOscillator();
  sj_lfo.frequency.value = 5.4;
  const sj_vib = sj_ctx.createGain();
  sj_vib.gain.setValueAtTime(0, sj_t);
  sj_vib.gain.linearRampToValueAtTime(sj_f * 0.012, sj_t + Math.min(0.5, sj_o.duration * 0.6));
  sj_lfo.connect(sj_vib);
  sj_vib.connect(sj_osc.frequency);
  sj_vib.connect(sj_sine.frequency);

  const sj_tone = sj_ctx.createGain();
  sj_tone.gain.value = 1;
  const sj_harm = sj_ctx.createGain();
  sj_harm.gain.value = 0.18;
  sj_osc.connect(sj_tone);
  sj_sine.connect(sj_harm).connect(sj_tone);

  const sj_breath = sj_core.noiseSource(true);
  const sj_bp = sj_ctx.createBiquadFilter();
  sj_bp.type = 'bandpass';
  sj_bp.frequency.value = sj_f * 2;
  sj_bp.Q.value = 6;
  const sj_bg = sj_ctx.createGain();
  sj_bg.gain.value = 0.3;
  sj_breath.connect(sj_bp).connect(sj_bg).connect(sj_tone);

  const sj_lp = sj_ctx.createBiquadFilter();
  sj_lp.type = 'lowpass';
  sj_lp.frequency.value = 3200;
  const sj_env = sj_core.out(sj_o.dest, 0, sj_o.pan ?? 0);
  sj_env.gain.setValueAtTime(0.0001, sj_t);
  sj_env.gain.linearRampToValueAtTime(sj_o.volume, sj_t + 0.12);
  sj_env.gain.setValueAtTime(sj_o.volume, Math.max(sj_t + 0.12, sj_end - 0.3));
  sj_env.gain.exponentialRampToValueAtTime(0.0001, sj_end + 0.25);
  sj_tone.connect(sj_lp).connect(sj_env);
  for (const sj_s of [sj_osc, sj_sine, sj_lfo, sj_breath]) {
    sj_s.start(sj_t);
    sj_s.stop(sj_end + 0.3);
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

const sj_TEMPLE_BELL = [0.5, 1, 1.19, 1.5, 2, 2.74, 3.76];
const sj_SMALL_BELL = [1, 2.76, 5.4, 8.93];

/** Additive bell: inharmonic partials with individual decays and slow beating. */
export function bell(sj_core: AudioCore, sj_o: BellOptions): void {
  const sj_ctx = sj_core.ctx;
  const sj_t = sj_o.time;
  const sj_partials = sj_o.partials ?? sj_SMALL_BELL;
  const sj_length = sj_o.length ?? 2.5;
  const sj_out = sj_core.out(sj_o.dest, sj_o.volume, sj_o.pan ?? 0);
  sj_partials.forEach((sj_ratio, sj_i) => {
    for (const sj_detune of [-0.6, 0.6]) {
      const sj_osc = sj_ctx.createOscillator();
      sj_osc.type = 'sine';
      sj_osc.frequency.value = sj_o.freq * sj_ratio + sj_detune * (sj_i + 1) * 0.3;
      const sj_g = sj_ctx.createGain();
      const sj_amp = (1 / (sj_i + 1.3)) * 0.5;
      const sj_decay = sj_length * Math.pow(0.68, sj_i);
      sj_g.gain.setValueAtTime(0.0001, sj_t);
      sj_g.gain.linearRampToValueAtTime(sj_amp, sj_t + 0.004);
      sj_g.gain.exponentialRampToValueAtTime(0.0001, sj_t + sj_decay);
      sj_osc.connect(sj_g).connect(sj_out);
      sj_osc.start(sj_t);
      sj_osc.stop(sj_t + sj_decay + 0.05);
    }
  });
}

/** Deep bronze temple bell (the bell tower). */
export function templeBell(
  sj_core: AudioCore,
  sj_time: number,
  sj_volume: number,
  sj_dest: AudioNode,
  sj_pan = 0,
): void {
  bell(sj_core, {
    freq: 196,
    time: sj_time,
    volume: sj_volume,
    dest: sj_dest,
    pan: sj_pan,
    length: 9,
    partials: sj_TEMPLE_BELL,
  });
  // strike transient
  const sj_ctx = sj_core.ctx;
  const sj_n = sj_core.noiseSource();
  const sj_lp = sj_ctx.createBiquadFilter();
  sj_lp.type = 'lowpass';
  sj_lp.frequency.value = 900;
  const sj_g = sj_core.out(sj_dest, 0, sj_pan);
  sj_core.envelope(sj_g.gain, sj_time, sj_volume * 0.8, 0.003, 0.12);
  sj_n.connect(sj_lp).connect(sj_g);
  sj_n.start(sj_time, Math.random());
  sj_n.stop(sj_time + 0.2);
}

/** Hollow wooden block tock. */
export function woodblock(
  sj_core: AudioCore,
  sj_time: number,
  sj_volume: number,
  sj_dest: AudioNode,
  sj_freq = 900,
  sj_pan = 0,
): void {
  const sj_ctx = sj_core.ctx;
  const sj_osc = sj_ctx.createOscillator();
  sj_osc.type = 'sine';
  sj_osc.frequency.setValueAtTime(sj_freq * 1.3, sj_time);
  sj_osc.frequency.exponentialRampToValueAtTime(sj_freq, sj_time + 0.02);
  const sj_g = sj_core.out(sj_dest, 0, sj_pan);
  sj_core.envelope(sj_g.gain, sj_time, sj_volume, 0.001, 0.09);
  sj_osc.connect(sj_g);
  sj_osc.start(sj_time);
  sj_osc.stop(sj_time + 0.15);
}

let sj_driveCurve: Float32Array | null = null;

/** A gentle tanh saturation curve: adds the overtones that let a deep boom carry. */
function drive(): Float32Array {
  if (sj_driveCurve) return sj_driveCurve;
  const sj_n = 1024;
  const sj_curve = new Float32Array(sj_n);
  const sj_k = 2.2;
  for (let sj_i = 0; sj_i < sj_n; sj_i++) {
    const sj_x = (sj_i / (sj_n - 1)) * 2 - 1;
    sj_curve[sj_i] = Math.tanh(sj_k * sj_x) / Math.tanh(sj_k);
  }
  sj_driveCurve = sj_curve;
  return sj_curve;
}

/**
 * Big barrel drum (a taiko): the beater's slap, a deep pitched boom with a second, higher
 * mode that small speakers can still play, the thud of the shell, and a little saturation
 * so the boom carries.
 */
export function bigDrum(
  sj_core: AudioCore,
  sj_time: number,
  sj_volume: number,
  sj_dest: AudioNode,
  sj_pan = 0,
): void {
  const sj_ctx = sj_core.ctx;
  const sj_shaper = sj_ctx.createWaveShaper();
  sj_shaper.curve = drive() as Float32Array<ArrayBuffer>;
  sj_shaper.oversample = '2x';
  const sj_out = sj_core.out(sj_dest, sj_volume, sj_pan);
  const sj_bus = sj_ctx.createGain();
  sj_bus.gain.value = 0.9;
  sj_bus.connect(sj_shaper).connect(sj_out);
  const sj_mode = (
    sj_from: number,
    sj_to: number,
    sj_glide: number,
    sj_peak: number,
    sj_decay: number,
  ) => {
    const sj_osc = sj_ctx.createOscillator();
    sj_osc.type = 'sine';
    sj_osc.frequency.setValueAtTime(sj_from, sj_time);
    sj_osc.frequency.exponentialRampToValueAtTime(sj_to, sj_time + sj_glide);
    const sj_g = sj_ctx.createGain();
    sj_core.envelope(sj_g.gain, sj_time, sj_peak, 0.004, sj_decay);
    sj_osc.connect(sj_g).connect(sj_bus);
    sj_osc.start(sj_time);
    sj_osc.stop(sj_time + sj_decay + 0.1);
  };
  sj_mode(150, 58, 0.22, 1, 1.3); // the boom
  sj_mode(260, 128, 0.16, 0.55, 0.55); // second mode: the "body" heard on small speakers
  sj_mode(390, 300, 0.1, 0.18, 0.2); // skin overtone
  const sj_burst = (
    sj_type: BiquadFilterType,
    sj_freq: number,
    sj_q: number,
    sj_peak: number,
    sj_decay: number,
  ) => {
    const sj_n = sj_core.noiseSource();
    const sj_f = sj_ctx.createBiquadFilter();
    sj_f.type = sj_type;
    sj_f.frequency.value = sj_freq;
    sj_f.Q.value = sj_q;
    const sj_g = sj_ctx.createGain();
    sj_core.envelope(sj_g.gain, sj_time, sj_peak, 0.001, sj_decay);
    sj_n.connect(sj_f).connect(sj_g).connect(sj_bus);
    sj_n.start(sj_time, Math.random());
    sj_n.stop(sj_time + sj_decay + 0.05);
  };
  sj_burst('bandpass', 1900, 0.9, 0.5, 0.06); // the beater's slap
  sj_burst('lowpass', 320, 0.7, 0.6, 0.28); // thud of the shell
}
