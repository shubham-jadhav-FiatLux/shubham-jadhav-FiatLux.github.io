import type { Camera, Vector3 } from 'three';
import { AudioCore } from './AudioCore';
import { Music } from './Music';
import { Sfx, type SfxName, type SfxOptions } from './Sfx';
import { Ambience } from './Ambience';
import { storage } from '../core/Storage';
import type { Surface } from '../world/layout';

export interface AudioFrame {
  camera: Camera;
  player: Vector3;
  swimming: boolean;
  meditating: boolean;
  panelOpen: boolean;
  waterfall: { x: number; z: number };
}

/**
 * The game's sound: a facade over the Web Audio graph. Nothing is created until the
 * visitor presses Begin (browsers block audio before a user gesture). Calls made before
 * that, or when Web Audio is unavailable, are silently ignored.
 */
export class GameAudio {
  private core: AudioCore | null = null;
  private music: Music | null = null;
  private sfxPlayer: Sfx | null = null;
  private ambience: Ambience | null = null;
  muted: boolean;
  musicOn: boolean;
  private duck = 1;

  constructor() {
    this.muted = storage.get('muted', false);
    this.musicOn = storage.get('music', true);
    document.addEventListener('visibilitychange', () => {
      if (!this.core) return;
      if (document.hidden) void this.core.ctx.suspend();
      else if (!this.muted) void this.core.ctx.resume();
    });
  }

  get ready(): boolean {
    return this.core !== null;
  }

  /** Must be called from a user gesture (the Begin button). */
  async unlock(): Promise<void> {
    if (this.core) return;
    try {
      this.core = new AudioCore();
      await this.core.ctx.resume();
    } catch (err) {
      console.warn('Audio unavailable', err);
      this.core = null;
      return;
    }
    this.sfxPlayer = new Sfx(this.core);
    this.ambience = new Ambience(this.core);
    this.music = new Music(this.core);
    this.applyLevels(true);
    this.music.start();
  }

  private applyLevels(instant = false): void {
    const core = this.core;
    if (!core) return;
    const t = core.now;
    const k = instant ? 0.01 : 0.15;
    core.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, t, k);
    core.music.gain.setTargetAtTime(this.musicOn ? 0.85 * this.duck : 0, t, k * 2);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    storage.set('muted', muted);
    if (this.core && !muted) void this.core.ctx.resume();
    this.applyLevels();
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    storage.set('music', on);
    this.applyLevels();
  }

  sfx(name: SfxName, o?: SfxOptions): void {
    if (!this.sfxPlayer || this.muted) return;
    if (name === 'discover') {
      // Let the sting breathe: dip the music for a moment.
      this.duck = 0.35;
      this.applyLevels();
      window.setTimeout(() => {
        this.duck = 1;
        this.applyLevels();
      }, 2600);
    }
    this.sfxPlayer.play(name, o);
  }

  footstep(surface: Surface, run: boolean): void {
    if (!this.sfxPlayer || this.muted) return;
    this.sfxPlayer.footstep(surface, run);
  }

  update(dt: number, f: AudioFrame): void {
    const core = this.core;
    if (!core || this.muted) return;
    // listener = camera position, "right" = camera's local +x on the ground plane
    const e = f.camera.matrixWorld.elements;
    const rx = e[0]!;
    const rz = e[2]!;
    const len = Math.hypot(rx, rz) || 1;
    core.listener.x = f.camera.position.x;
    core.listener.y = f.camera.position.y;
    core.listener.z = f.camera.position.z;
    core.listener.rightX = rx / len;
    core.listener.rightZ = rz / len;
    this.music?.update();
    this.ambience?.update(dt, f.player, f.waterfall, f.meditating || f.panelOpen);
  }
}

export type { SfxName };
