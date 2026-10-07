/**
 * Shared Web Audio plumbing: the context, mix buses, a procedural convolution reverb,
 * a noise buffer and small helpers for envelopes and positional panning.
 */
export class AudioCore {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly sfx: GainNode;
  readonly music: GainNode;
  readonly ambience: GainNode;
  /** send into the reverb */
  readonly reverb: GainNode;
  readonly noise: AudioBuffer;
  /** listener in world space (camera), updated every frame */
  readonly listener = { x: 0, y: 0, z: 0, rightX: 1, rightZ: 0 };

  constructor() {
    const sj_Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new sj_Ctx({ latencyHint: 'interactive' });
    const sj_ctx = this.ctx;
    const sj_comp = sj_ctx.createDynamicsCompressor();
    sj_comp.threshold.value = -14;
    sj_comp.knee.value = 12;
    sj_comp.ratio.value = 3;
    sj_comp.attack.value = 0.01;
    sj_comp.release.value = 0.25;
    sj_comp.connect(sj_ctx.destination);
    this.master = sj_ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(sj_comp);

    const sj_convolver = sj_ctx.createConvolver();
    sj_convolver.buffer = this.impulse(3.2, 2.6);
    const sj_wet = sj_ctx.createGain();
    sj_wet.gain.value = 0.55;
    sj_convolver.connect(sj_wet).connect(this.master);
    this.reverb = sj_ctx.createGain();
    this.reverb.connect(sj_convolver);

    this.sfx = this.bus(0.9, 0.18);
    this.music = this.bus(0.85, 0.45);
    this.ambience = this.bus(0.55, 0.1);
    this.noise = this.makeNoise(2);
  }

  private bus(sj_level: number, sj_send: number): GainNode {
    const sj_g = this.ctx.createGain();
    sj_g.gain.value = sj_level;
    sj_g.connect(this.master);
    const sj_s = this.ctx.createGain();
    sj_s.gain.value = sj_send;
    sj_g.connect(sj_s).connect(this.reverb);
    return sj_g;
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  /** Stereo impulse response: decaying noise with a slightly darker tail. */
  private impulse(sj_seconds: number, sj_decay: number): AudioBuffer {
    const sj_rate = this.ctx.sampleRate;
    const sj_len = Math.floor(sj_rate * sj_seconds);
    const sj_buf = this.ctx.createBuffer(2, sj_len, sj_rate);
    for (let sj_c = 0; sj_c < 2; sj_c++) {
      const sj_d = sj_buf.getChannelData(sj_c);
      let sj_lp = 0;
      for (let sj_i = 0; sj_i < sj_len; sj_i++) {
        const sj_t = sj_i / sj_len;
        const sj_white = Math.random() * 2 - 1;
        sj_lp += (sj_white - sj_lp) * (0.9 - sj_t * 0.6);
        sj_d[sj_i] =
          sj_lp *
          Math.pow(1 - sj_t, sj_decay) *
          (sj_i < sj_rate * 0.012 ? sj_i / (sj_rate * 0.012) : 1);
      }
    }
    return sj_buf;
  }

  private makeNoise(sj_seconds: number): AudioBuffer {
    const sj_len = Math.floor(this.ctx.sampleRate * sj_seconds);
    const sj_buf = this.ctx.createBuffer(1, sj_len, this.ctx.sampleRate);
    const sj_d = sj_buf.getChannelData(0);
    for (let sj_i = 0; sj_i < sj_len; sj_i++) sj_d[sj_i] = Math.random() * 2 - 1;
    return sj_buf;
  }

  /** A looping or one-shot noise source starting at a random offset. */
  noiseSource(sj_loop = false): AudioBufferSourceNode {
    const sj_src = this.ctx.createBufferSource();
    sj_src.buffer = this.noise;
    sj_src.loop = sj_loop;
    return sj_src;
  }

  /** Attack / exponential decay envelope on a gain param. */
  envelope(
    sj_param: AudioParam,
    sj_t: number,
    sj_peak: number,
    sj_attack: number,
    sj_decay: number,
  ): void {
    sj_param.cancelScheduledValues(sj_t);
    sj_param.setValueAtTime(0.0001, sj_t);
    sj_param.linearRampToValueAtTime(sj_peak, sj_t + sj_attack);
    sj_param.exponentialRampToValueAtTime(0.0001, sj_t + sj_attack + sj_decay);
  }

  /**
   * Gain + pan for a world position relative to the listener.
   * Returns [gain, pan]; sources without a position are centred at full volume.
   */
  spatial(sj_x?: number, sj_z?: number, sj_ref = 8): [number, number] {
    if (sj_x === undefined || sj_z === undefined) return [1, 0];
    const sj_l = this.listener;
    const sj_dx = sj_x - sj_l.x;
    const sj_dz = sj_z - sj_l.z;
    const sj_d = Math.hypot(sj_dx, sj_dz);
    const sj_gain = 1 / (1 + Math.max(0, sj_d - sj_ref * 0.25) / sj_ref);
    const sj_pan =
      sj_d > 0.01
        ? Math.max(-0.9, Math.min(0.9, (sj_dx * sj_l.rightX + sj_dz * sj_l.rightZ) / sj_d))
        : 0;
    return [sj_gain, sj_pan];
  }

  /** gain → panner → destination chain for one voice. */
  out(sj_dest: AudioNode, sj_volume: number, sj_pan = 0): GainNode {
    const sj_g = this.ctx.createGain();
    sj_g.gain.value = sj_volume;
    if (sj_pan !== 0 && this.ctx.createStereoPanner) {
      const sj_p = this.ctx.createStereoPanner();
      sj_p.pan.value = sj_pan;
      sj_g.connect(sj_p).connect(sj_dest);
    } else {
      sj_g.connect(sj_dest);
    }
    return sj_g;
  }
}

/** Frequency of a MIDI note number. */
export function mtof(sj_midi: number): number {
  return 440 * Math.pow(2, (sj_midi - 69) / 12);
}
