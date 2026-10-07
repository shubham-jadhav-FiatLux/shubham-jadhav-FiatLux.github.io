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

  /**
   * @param sj_context the WebGL 2 context already made on `canvas` while checking for
   *   support (`createContext`), so the page never pays for a second one
   */
  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly scene: Scene,
    private camera: PerspectiveCamera,
    sj_settings: QualitySettings,
    sj_context?: WebGL2RenderingContext,
  ) {
    this.settings = sj_settings;
    this.webgl = new WebGLRenderer({
      canvas,
      context: sj_context,
      antialias: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
    });
    // Checking every program for errors makes the browser wait for each shader to finish
    // compiling (it cannot compile in the background): only worth it while developing.
    this.webgl.debug.checkShaderErrors = import.meta.env.DEV;
    this.webgl.outputColorSpace = SRGBColorSpace;
    this.webgl.toneMapping = NoToneMapping;
    this.webgl.toneMappingExposure = 1.0;
    this.webgl.shadowMap.enabled = sj_settings.shadows;
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
      multisampling: this.samplesFor(this.pixelRatioFor(sj_settings)),
    });
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.rebuildEffects();
  }

  get info(): string {
    const sj_r = this.webgl.info.render;
    return `${sj_r.calls} calls · ${(sj_r.triangles / 1000).toFixed(0)}k tris`;
  }

  setCamera(sj_camera: PerspectiveCamera): void {
    this.camera = sj_camera;
    this.renderPass.mainCamera = sj_camera;
    this.rebuildEffects();
  }

  applyQuality(sj_settings: QualitySettings): void {
    const sj_shadowsChanged = sj_settings.shadows !== this.settings.shadows;
    this.settings = sj_settings;
    this.webgl.shadowMap.enabled = sj_settings.shadows;
    if (sj_shadowsChanged) {
      this.scene.traverse((sj_o) => {
        const sj_m = (sj_o as { material?: { needsUpdate: boolean } | { needsUpdate: boolean }[] })
          .material;
        if (Array.isArray(sj_m)) sj_m.forEach((sj_x) => (sj_x.needsUpdate = true));
        else if (sj_m) sj_m.needsUpdate = true;
      });
    }
    this.rebuildEffects();
    this.resize(this.width, this.height);
  }

  private pixelRatioFor(sj_settings: QualitySettings): number {
    return Math.min(window.devicePixelRatio || 1, sj_settings.maxPixelRatio) * this.renderScale;
  }

  /**
   * MSAA samples for a pixel ratio. On a high-density screen every CSS pixel is already
   * drawn as several, so two samples smooth edges as well as four would, for half the
   * memory and bandwidth (four samples of a half-float 4K buffer are several hundred MB).
   */
  private samplesFor(sj_pixelRatio: number): number {
    return sj_pixelRatio >= 1.5 ? Math.min(this.settings.msaa, 2) : this.settings.msaa;
  }

  setRenderScale(sj_scale: number): void {
    this.renderScale = sj_scale;
    this.resize(this.width, this.height);
  }

  private rebuildEffects(): void {
    if (this.effectPass) {
      this.composer.removePass(this.effectPass);
      this.effectPass.dispose();
    }
    const sj_effects: Effect[] = [];
    if (this.settings.bloom) sj_effects.push(this.bloom);
    sj_effects.push(this.toneMapping, this.grade, this.vignette);
    this.effectPass = new EffectPass(this.camera, ...sj_effects);
    this.composer.addPass(this.effectPass);
  }

  resize(sj_width: number, sj_height: number): void {
    this.width = Math.max(1, sj_width);
    this.height = Math.max(1, sj_height);
    this.pixelRatio = this.pixelRatioFor(this.settings);
    this.webgl.setPixelRatio(this.pixelRatio);
    const sj_samples = this.samplesFor(this.pixelRatio);
    if (this.composer.multisampling !== sj_samples) this.composer.multisampling = sj_samples;
    // The composer resizes the renderer as well as its own buffers.
    this.composer.setSize(this.width, this.height, true);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Compiles the scene's shaders, in the background where the browser supports it. They
   * are compiled for the state they are drawn in (into the post-processing buffer, not
   * straight to the screen), or the first frame would compile them all over again.
   *
   * Without KHR_parallel_shader_compile the browser cannot report progress, and three.js's
   * compileAsync would only add a console warning to the same work. Those browsers get the
   * shaders queued and one pause until the next task: that lets the browser start on all
   * of them together, where drawing at once made the valley about 60% slower to get ready
   * (measured with SwiftShader, 9.5 s against 15.5 s).
   */
  compile(): Promise<unknown> {
    const sj_gl = this.webgl;
    const sj_previous = sj_gl.getRenderTarget();
    sj_gl.setRenderTarget(this.composer.inputBuffer);
    const sj_done = sj_gl.extensions.has('KHR_parallel_shader_compile')
      ? sj_gl.compileAsync(this.scene, this.camera)
      : new Promise((sj_resolve) => {
          sj_gl.compile(this.scene, this.camera);
          setTimeout(sj_resolve, 0);
        });
    sj_gl.setRenderTarget(sj_previous);
    return sj_done;
  }

  /** Briefly intensifies the bloom (discoveries, the bell). */
  pulseBloom(sj_amount: number): void {
    this.bloomBoost = Math.max(this.bloomBoost, sj_amount);
  }

  render(sj_dt: number): void {
    if (this.bloomBoost > 0) {
      this.bloomBoost = Math.max(0, this.bloomBoost - sj_dt * 0.9);
      this.bloom.intensity = this.bloomBase * (1 + this.bloomBoost);
    }
    this.webgl.info.reset();
    this.composer.render(sj_dt);
  }

  dispose(): void {
    this.composer.dispose();
    this.webgl.dispose();
  }
}
