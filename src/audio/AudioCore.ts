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
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);

    const convolver = ctx.createConvolver();
    convolver.buffer = this.impulse(3.2, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    convolver.connect(wet).connect(this.master);
    this.reverb = ctx.createGain();
    this.reverb.connect(convolver);

    this.sfx = this.bus(0.9, 0.18);
    this.music = this.bus(0.85, 0.45);
    this.ambience = this.bus(0.55, 0.1);
    this.noise = this.makeNoise(2);
  }

  private bus(level: number, send: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = level;
    g.connect(this.master);
    const s = this.ctx.createGain();
    s.gain.value = send;
    g.connect(s).connect(this.reverb);
    return g;
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  /** Stereo impulse response: decaying noise with a slightly darker tail. */
  private impulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const white = Math.random() * 2 - 1;
        lp += (white - lp) * (0.9 - t * 0.6);
        d[i] = lp * Math.pow(1 - t, decay) * (i < rate * 0.012 ? i / (rate * 0.012) : 1);
      }
    }
    return buf;
  }

  private makeNoise(seconds: number): AudioBuffer {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** A looping or one-shot noise source starting at a random offset. */
  noiseSource(loop = false): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = loop;
    return src;
  }

  /** Attack / exponential decay envelope on a gain param. */
  envelope(param: AudioParam, t: number, peak: number, attack: number, decay: number): void {
    param.cancelScheduledValues(t);
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + attack);
    param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  /**
   * Gain + pan for a world position relative to the listener.
   * Returns [gain, pan]; sources without a position are centred at full volume.
   */
  spatial(x?: number, z?: number, ref = 8): [number, number] {
    if (x === undefined || z === undefined) return [1, 0];
    const l = this.listener;
    const dx = x - l.x;
    const dz = z - l.z;
    const d = Math.hypot(dx, dz);
    const gain = 1 / (1 + Math.max(0, d - ref * 0.25) / ref);
    const pan = d > 0.01 ? Math.max(-0.9, Math.min(0.9, (dx * l.rightX + dz * l.rightZ) / d)) : 0;
    return [gain, pan];
  }

  /** gain → panner → destination chain for one voice. */
  out(dest: AudioNode, volume: number, pan = 0): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = volume;
    if (pan !== 0 && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(dest);
    } else {
      g.connect(dest);
    }
    return g;
  }
}

/** Frequency of a MIDI note number. */
export function mtof(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
