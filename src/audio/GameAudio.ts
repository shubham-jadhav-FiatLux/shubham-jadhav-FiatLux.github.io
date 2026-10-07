import type { Camera, Vector3 } from 'three';
import { AudioCore } from './AudioCore';
import { Music } from './Music';
import { Sfx, type SfxName, type SfxOptions } from './Sfx';
import { Ambience } from './Ambience';
import { sj_storage } from '../core/Storage';
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
    this.muted = sj_storage.get('muted', false);
    this.musicOn = sj_storage.get('music', true);
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
    } catch (sj_err) {
      console.warn('Audio unavailable', sj_err);
      this.core = null;
      return;
    }
    this.sfxPlayer = new Sfx(this.core);
    this.ambience = new Ambience(this.core);
    this.music = new Music(this.core);
    this.applyLevels(true);
    this.music.start();
  }

  private applyLevels(sj_instant = false): void {
    const sj_core = this.core;
    if (!sj_core) return;
    const sj_t = sj_core.now;
    const sj_k = sj_instant ? 0.01 : 0.15;
    sj_core.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, sj_t, sj_k);
    sj_core.music.gain.setTargetAtTime(this.musicOn ? 0.85 * this.duck : 0, sj_t, sj_k * 2);
  }

  setMuted(sj_muted: boolean): void {
    this.muted = sj_muted;
    sj_storage.set('muted', sj_muted);
    if (this.core && !sj_muted) void this.core.ctx.resume();
    this.applyLevels();
  }

  setMusic(sj_on: boolean): void {
    this.musicOn = sj_on;
    sj_storage.set('music', sj_on);
    this.applyLevels();
  }

  sfx(sj_name: SfxName, sj_o?: SfxOptions): void {
    if (!this.sfxPlayer || this.muted) return;
    if (sj_name === 'discover') {
      // Let the sting breathe: dip the music for a moment.
      this.duck = 0.35;
      this.applyLevels();
      window.setTimeout(() => {
        this.duck = 1;
        this.applyLevels();
      }, 2600);
    }
    this.sfxPlayer.play(sj_name, sj_o);
  }

  footstep(sj_surface: Surface, sj_run: boolean): void {
    if (!this.sfxPlayer || this.muted) return;
    this.sfxPlayer.footstep(sj_surface, sj_run);
  }

  update(sj_dt: number, sj_f: AudioFrame): void {
    const sj_core = this.core;
    if (!sj_core || this.muted) return;
    // listener = camera position, "right" = camera's local +x on the ground plane
    const sj_e = sj_f.camera.matrixWorld.elements;
    const sj_rx = sj_e[0]!;
    const sj_rz = sj_e[2]!;
    const sj_len = Math.hypot(sj_rx, sj_rz) || 1;
    sj_core.listener.x = sj_f.camera.position.x;
    sj_core.listener.y = sj_f.camera.position.y;
    sj_core.listener.z = sj_f.camera.position.z;
    sj_core.listener.rightX = sj_rx / sj_len;
    sj_core.listener.rightZ = sj_rz / sj_len;
    this.music?.update();
    this.ambience?.update(sj_dt, sj_f.player, sj_f.waterfall, sj_f.meditating || sj_f.panelOpen);
  }
}

export type { SfxName };
