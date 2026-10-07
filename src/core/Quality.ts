import { Emitter } from './Emitter';
import { sj_storage } from './Storage';

export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualitySettings {
  level: QualityLevel;
  /** upper bound for devicePixelRatio */
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  /** grass blades in the patch that follows the panda */
  grassBlades: number;
  /** side length (m) of that patch */
  grassPatch: number;
  /** MSAA samples for the main render target (WebGL 2) */
  msaa: number;
  bloom: boolean;
  /** multiplier for particle counts (petals, fireflies...) */
  particles: number;
  /** multiplier for decorative instance counts (flowers, pebbles...) */
  detail: number;
}

export const sj_QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  low: {
    level: 'low',
    maxPixelRatio: 1,
    shadows: false,
    shadowMapSize: 1024,
    grassBlades: 14000,
    grassPatch: 30,
    msaa: 0,
    bloom: false,
    particles: 0.4,
    detail: 0.5,
  },
  medium: {
    level: 'medium',
    maxPixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    grassBlades: 36000,
    grassPatch: 38,
    msaa: 2,
    bloom: true,
    particles: 0.75,
    detail: 0.8,
  },
  high: {
    level: 'high',
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 2048,
    grassBlades: 70000,
    grassPatch: 46,
    msaa: 4,
    bloom: true,
    particles: 1,
    detail: 1,
  },
};

const sj_LEVELS: QualityLevel[] = ['low', 'medium', 'high'];

function isLikelyMobile(): boolean {
  const sj_coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const sj_small = Math.min(window.screen.width, window.screen.height) < 820;
  return sj_coarse && sj_small;
}

/**
 * Picks a quality preset, persists the visitor's choice and adapts downwards when the
 * frame rate stays low. Consumers subscribe to `change`.
 */
export class Quality extends Emitter<{ change: QualitySettings; scale: number }> {
  settings: QualitySettings;
  /** dynamic resolution multiplier applied on top of the pixel ratio */
  renderScale = 1;
  /** the visitor picked a preset (URL, menu or an earlier visit): never auto-lower it */
  userChosen: boolean;
  adaptive: boolean;

  private frames = 0;
  private lastFrameTime = 0;
  private accum = 0;
  private warmup = 4;
  private cooldown = 0;

  constructor() {
    super();
    const sj_params = new URLSearchParams(window.location.search);
    const sj_fromUrl = sj_params.get('quality') as QualityLevel | null;
    const sj_saved = sj_storage.get<QualityLevel | null>('quality', null);
    const sj_chosen = sj_fromUrl && sj_LEVELS.includes(sj_fromUrl) ? sj_fromUrl : sj_saved;
    this.userChosen = sj_chosen !== null;
    // High by default; phones start one step lower. Either way the monitor below steps
    // down if the frame rate stays low.
    const sj_level: QualityLevel = sj_chosen ?? (isLikelyMobile() ? 'medium' : 'high');
    this.settings = { ...sj_QUALITY_PRESETS[sj_level] };
    this.adaptive = sj_params.get('adaptive') !== '0';
    // Frames measured before the tab was hidden say nothing about the ones after it.
    document.addEventListener('visibilitychange', () => {
      this.frames = 0;
      this.accum = 0;
      this.lastFrameTime = 0;
    });
  }

  /** `sj_persist` marks a choice made by the visitor: it is saved and never auto-lowered. */
  set(sj_level: QualityLevel, sj_persist = true): void {
    if (sj_persist) {
      sj_storage.set('quality', sj_level);
      this.userChosen = true;
    }
    this.settings = { ...sj_QUALITY_PRESETS[sj_level] };
    this.emit('change', this.settings);
    if (this.renderScale !== 1) {
      this.renderScale = 1;
      this.emit('scale', 1);
    }
  }

  /** Called once per frame with the real (unclamped) frame time in seconds. */
  monitor(sj_frameTime: number): void {
    if (!this.adaptive || this.userChosen) return;
    // One long frame after quick ones is a stall (tab switch, hidden iframe, GC), not a
    // slow GPU; a GPU that is slow every frame still gets measured.
    const sj_stall = sj_frameTime > 0.25 && this.lastFrameTime < 0.1;
    this.lastFrameTime = sj_frameTime;
    if (sj_stall) return;
    if (this.warmup > 0) {
      this.warmup -= sj_frameTime;
      return;
    }
    if (this.cooldown > 0) {
      this.cooldown -= sj_frameTime;
      return;
    }
    this.frames++;
    this.accum += sj_frameTime;
    if (this.accum < 3) return;
    const sj_fps = this.frames / this.accum;
    this.frames = 0;
    this.accum = 0;
    if (sj_fps >= 42) return;
    // First lower the resolution, then drop a preset.
    if (this.renderScale > 0.72) {
      this.renderScale = Math.max(0.7, this.renderScale - 0.15);
      this.emit('scale', this.renderScale);
      this.cooldown = 2;
      return;
    }
    const sj_idx = sj_LEVELS.indexOf(this.settings.level);
    if (sj_idx > 0) {
      this.set(sj_LEVELS[sj_idx - 1]!, false);
      this.cooldown = 3;
    }
  }
}
