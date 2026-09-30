import { Emitter } from './Emitter';
import { storage } from './Storage';

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

export const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
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

const LEVELS: QualityLevel[] = ['low', 'medium', 'high'];

function isLikelyMobile(): boolean {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const small = Math.min(window.screen.width, window.screen.height) < 820;
  return coarse && small;
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
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('quality') as QualityLevel | null;
    const saved = storage.get<QualityLevel | null>('quality', null);
    const chosen = fromUrl && LEVELS.includes(fromUrl) ? fromUrl : saved;
    this.userChosen = chosen !== null;
    const level: QualityLevel = chosen ?? (isLikelyMobile() ? 'low' : 'medium');
    this.settings = { ...QUALITY_PRESETS[level] };
    this.adaptive = params.get('adaptive') !== '0';
    // Frames measured before the tab was hidden say nothing about the ones after it.
    document.addEventListener('visibilitychange', () => {
      this.frames = 0;
      this.accum = 0;
      this.lastFrameTime = 0;
    });
  }

  /** `persist` marks a choice made by the visitor: it is saved and never auto-lowered. */
  set(level: QualityLevel, persist = true): void {
    if (persist) {
      storage.set('quality', level);
      this.userChosen = true;
    }
    this.settings = { ...QUALITY_PRESETS[level] };
    this.emit('change', this.settings);
    if (this.renderScale !== 1) {
      this.renderScale = 1;
      this.emit('scale', 1);
    }
  }

  /** Called once per frame with the real (unclamped) frame time in seconds. */
  monitor(frameTime: number): void {
    if (!this.adaptive || this.userChosen) return;
    // One long frame after quick ones is a stall (tab switch, hidden iframe, GC), not a
    // slow GPU; a GPU that is slow every frame still gets measured.
    const stall = frameTime > 0.25 && this.lastFrameTime < 0.1;
    this.lastFrameTime = frameTime;
    if (stall) return;
    if (this.warmup > 0) {
      this.warmup -= frameTime;
      return;
    }
    if (this.cooldown > 0) {
      this.cooldown -= frameTime;
      return;
    }
    this.frames++;
    this.accum += frameTime;
    if (this.accum < 3) return;
    const fps = this.frames / this.accum;
    this.frames = 0;
    this.accum = 0;
    if (fps >= 42) return;
    // First lower the resolution, then drop a preset.
    if (this.renderScale > 0.72) {
      this.renderScale = Math.max(0.7, this.renderScale - 0.15);
      this.emit('scale', this.renderScale);
      this.cooldown = 2;
      return;
    }
    const idx = LEVELS.indexOf(this.settings.level);
    if (idx > 0) {
      this.set(LEVELS[idx - 1]!, false);
      this.cooldown = 3;
    }
  }
}
