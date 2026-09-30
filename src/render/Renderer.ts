import {
  HalfFloatType,
  NoToneMapping,
  PCFShadowMap,
  SRGBColorSpace,
  WebGLRenderer,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  type Effect,
} from 'postprocessing';
import { GradeEffect } from './GradeEffect';
import type { QualitySettings } from '../core/Quality';

/**
 * WebGL 2 renderer plus the post-processing chain:
 * scene (HDR, MSAA) → bloom → ACES tone mapping → colour grade → vignette.
 */
export class Renderer {
  readonly webgl: WebGLRenderer;
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private effectPass: EffectPass | null = null;
  readonly bloom: BloomEffect;
  readonly grade = new GradeEffect();
  readonly vignette = new VignetteEffect({ offset: 0.32, darkness: 0.42 });
  readonly toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private settings: QualitySettings;
  private renderScale = 1;
  private bloomBoost = 0;
  private readonly bloomBase = 0.75;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly scene: Scene,
    private camera: PerspectiveCamera,
    settings: QualitySettings,
  ) {
    this.settings = settings;
    this.webgl = new WebGLRenderer({
      canvas,
      antialias: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
    });
    this.webgl.outputColorSpace = SRGBColorSpace;
    this.webgl.toneMapping = NoToneMapping;
    this.webgl.toneMappingExposure = 1.0;
    this.webgl.shadowMap.enabled = settings.shadows;
    this.webgl.shadowMap.type = PCFShadowMap;
    // Stats cover the whole frame (all passes), reset manually in render().
    this.webgl.info.autoReset = false;

    this.bloom = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: 0.92,
      luminanceSmoothing: 0.25,
      intensity: this.bloomBase,
      radius: 0.72,
    });

    this.composer = new EffectComposer(this.webgl, {
      frameBufferType: HalfFloatType,
      multisampling: settings.msaa,
    });
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.rebuildEffects();
  }

  get info(): string {
    const r = this.webgl.info.render;
    return `${r.calls} calls · ${(r.triangles / 1000).toFixed(0)}k tris`;
  }

  setCamera(camera: PerspectiveCamera): void {
    this.camera = camera;
    this.renderPass.mainCamera = camera;
    this.rebuildEffects();
  }

  applyQuality(settings: QualitySettings): void {
    const shadowsChanged = settings.shadows !== this.settings.shadows;
    this.settings = settings;
    this.webgl.shadowMap.enabled = settings.shadows;
    if (shadowsChanged) {
      this.scene.traverse((o) => {
        const m = (o as { material?: { needsUpdate: boolean } | { needsUpdate: boolean }[] })
          .material;
        if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
        else if (m) m.needsUpdate = true;
      });
    }
    this.composer.multisampling = settings.msaa;
    this.rebuildEffects();
    this.resize(this.width, this.height);
  }

  setRenderScale(scale: number): void {
    this.renderScale = scale;
    this.resize(this.width, this.height);
  }

  private rebuildEffects(): void {
    if (this.effectPass) {
      this.composer.removePass(this.effectPass);
      this.effectPass.dispose();
    }
    const effects: Effect[] = [];
    if (this.settings.bloom) effects.push(this.bloom);
    effects.push(this.toneMapping, this.grade, this.vignette);
    this.effectPass = new EffectPass(this.camera, ...effects);
    this.composer.addPass(this.effectPass);
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.pixelRatio =
      Math.min(window.devicePixelRatio || 1, this.settings.maxPixelRatio) * this.renderScale;
    this.webgl.setPixelRatio(this.pixelRatio);
    // The composer resizes the renderer as well as its own buffers.
    this.composer.setSize(this.width, this.height, true);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  /** Briefly intensifies the bloom (discoveries, the bell). */
  pulseBloom(amount: number): void {
    this.bloomBoost = Math.max(this.bloomBoost, amount);
  }

  render(dt: number): void {
    if (this.bloomBoost > 0) {
      this.bloomBoost = Math.max(0, this.bloomBoost - dt * 0.9);
      this.bloom.intensity = this.bloomBase * (1 + this.bloomBoost);
    }
    this.webgl.info.reset();
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
    this.webgl.dispose();
  }
}
