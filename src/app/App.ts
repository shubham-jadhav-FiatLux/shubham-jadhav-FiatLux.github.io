import { Color, Fog, Scene, Vector3, type Texture, type Vector2 } from 'three';
import { Debug } from '../core/Debug';
import { Emitter } from '../core/Emitter';
import { Input } from '../core/Input';
import { Loop } from '../core/Loop';
import { Quality } from '../core/Quality';
import { Renderer } from '../render/Renderer';
import { installAtmosphericFog } from '../render/fog';
import { sj_ATMOSPHERE } from '../render/atmosphere';
import { createSkyEnvironment } from '../render/environment';
import { sj_globalUniforms } from '../render/uniforms';
import { CameraRig } from '../camera/CameraRig';
import { CollisionWorld } from '../physics/CollisionWorld';
import { Terrain } from '../world/Terrain';
import { Sky } from '../world/Sky';
import { Mountains } from '../world/mountains/Mountains';
import { Lighting } from '../world/Lighting';
import { sj_PLACES } from '../world/layout';
import { Panda } from '../player/Panda';
import { PandaAnimator } from '../player/PandaAnimator';
import { PlayerController } from '../player/PlayerController';
import { ScarfTails } from '../player/ScarfTails';
import { Particles, sj_SPRITE } from '../effects/Particles';
import { Grass } from '../world/nature/Grass';
import { Nature } from '../world/nature/Nature';
import { Wildlife } from '../world/nature/Wildlife';
import { Water } from '../world/water/Water';
import { Architecture } from '../world/architecture/Architecture';
import { LanternGlow } from '../world/architecture/LanternGlow';
import { Placement } from '../world/placement';
import { sj_portfolio } from '../content/portfolio';
import type { PortfolioContent } from '../content/types';

export type AppEvents = {
  ready: void;
  started: void;
};

/** Something that drives the panda instead of the visitor (the tour's autopilot). */
export interface PandaDriver {
  steer(sj_dt: number): { move: Vector2; run: boolean; jump?: boolean };
  /** idle time handed to the animator */
  idleSeconds: number;
}

const sj_NO_LOOK = { x: 0, y: 0 };

const sj_nextFrame = () => new Promise<void>((sj_r) => requestAnimationFrame(() => sj_r()));

const sj_DUST = new Color('#d9c4a0');
const sj_SPLASH = new Color('#e8f6f4');
const sj_tmp = new Vector3();

/**
 * Owns the scene, the renderer, the main loop and every system in the valley.
 */
export class App extends Emitter<AppEvents> {
  readonly scene = new Scene();
  readonly quality = new Quality();
  readonly debug = new Debug();
  readonly input: Input;
  readonly rig: CameraRig;
  readonly renderer: Renderer;
  readonly loop: Loop;
  readonly collision = new CollisionWorld();

  terrain!: Terrain;
  grass!: Grass;
  nature!: Nature;
  water!: Water;
  architecture!: Architecture;
  lanterns!: LanternGlow;
  wildlife!: Wildlife;
  /** prefiltered sky for reflections on glossy materials */
  private environment: Texture | null = null;
  placement!: Placement;
  sky!: Sky;
  lighting!: Lighting;
  panda!: Panda;
  controller!: PlayerController;
  animator!: PandaAnimator;
  scarf!: ScarfTails;
  particles!: Particles;

  started = false;
  /** true while a UI panel (scroll, map, menu) has focus */
  uiBlocking = false;
  /** skip rendering entirely (e.g. while the full-screen page view covers the canvas) */
  renderPaused = false;
  /** extra per-frame systems (the gameplay layer registers itself here) */
  readonly updaters: ((sj_dt: number, sj_elapsed: number) => void)[] = [];
  /** per-frame systems that place the camera (run after the panda moves, before the rig) */
  readonly beforeCamera: ((sj_dt: number) => void)[] = [];
  /** when set, drives the panda instead of the visitor's input */
  driver: PandaDriver | null = null;
  private reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly content: PortfolioContent = sj_portfolio,
    sj_context?: WebGL2RenderingContext,
  ) {
    super();
    installAtmosphericFog();
    this.scene.fog = new Fog(sj_ATMOSPHERE.fogColor, sj_ATMOSPHERE.fogNear, sj_ATMOSPHERE.fogFar);
    this.scene.background = sj_ATMOSPHERE.fogColor.clone();
    this.input = new Input(canvas);
    this.rig = new CameraRig(window.innerWidth / window.innerHeight, (sj_x, sj_z) =>
      this.terrain ? this.terrain.heightAt(sj_x, sj_z) : 0,
    );
    this.rig.reducedMotion = this.reducedMotion;
    this.renderer = new Renderer(
      canvas,
      this.scene,
      this.rig.camera,
      this.quality.settings,
      sj_context,
    );
    this.loop = new Loop(this.tick);
    const sj_sim = Number(new URLSearchParams(window.location.search).get('sim'));
    if (sj_sim > 1) this.loop.substeps = Math.min(16, Math.round(sj_sim));
    this.quality.on('change', (sj_s) => {
      this.renderer.applyQuality(sj_s);
      this.lighting?.applyQuality(sj_s);
      this.lanterns?.applyQuality(sj_s);
      this.grass?.applyQuality(sj_s);
      this.onResize();
    });
    this.quality.on('scale', (sj_k) => {
      this.renderer.setRenderScale(sj_k);
      this.onResize();
    });
    window.addEventListener('resize', this.onResize);
  }

  /**
   * Builds the world step by step so the loading bar can breathe between steps. Then
   * the gameplay layer adds its own objects, and `prepare()` gets everything ready to draw.
   */
  async load(sj_progress: (sj_fraction: number, sj_label: string) => void): Promise<void> {
    await this.debug.init();
    // Canvas textures (signboards, banners, labels) need the brush font loaded first.
    try {
      await Promise.all([
        document.fonts.load(
          "64px 'Brush'",
          this.content.site.gateGlyphs + this.content.site.seal + 'Aa一',
        ),
        document.fonts.load("700 32px 'Lora'"),
      ]);
    } catch {
      /* fall back to system fonts */
    }
    const sj_steps: [string, () => void][] = [
      ['Shaping the valley', () => this.buildTerrain()],
      ['Raising the mountains', () => this.buildSky()],
      ['Building the pagoda', () => this.buildArchitecture()],
      ['Growing bamboo and blossoms', () => this.buildNature()],
      ['Waking the panda', () => this.buildPlayer()],
      ['Filling the lake', () => this.buildWater()],
      ['Finishing touches', () => this.terrain.mask.commit()],
    ];
    for (let sj_i = 0; sj_i < sj_steps.length; sj_i++) {
      const [sj_label, sj_run] = sj_steps[sj_i]!;
      sj_progress(sj_i / (sj_steps.length + 1), sj_label);
      await sj_nextFrame();
      sj_run();
    }
    sj_progress(sj_steps.length / (sj_steps.length + 1), 'Preparing shaders');
    await sj_nextFrame();
  }

  /**
   * Compiles every shader the valley needs before the first frame is shown (a shader
   * compiled on first use stalls that frame), then starts the loop.
   */
  async prepare(sj_progress: (sj_fraction: number, sj_label: string) => void): Promise<void> {
    this.onResize();
    try {
      // in the background where the browser can compile shaders in parallel
      await this.renderer.compile();
    } catch {
      /* an optimisation only */
    }
    // One full frame with the sun's shadow stretched over the whole valley prepares what
    // that leaves out: the shadow shaders of every caster and the post-processing passes.
    this.lighting.coverValley(true);
    this.renderer.render(0);
    this.lighting.coverValley(false);
    sj_progress(1, 'Ready');
    this.loop.start();
    this.emit('ready', undefined);
  }

  private buildTerrain(): void {
    this.terrain = new Terrain();
    this.terrain.addTo(this.scene);
    this.grass = new Grass(this.quality.settings);
    this.grass.addTo(this.scene);
  }

  private buildArchitecture(): void {
    this.placement = new Placement(this.terrain);
    this.architecture = new Architecture(
      this.scene,
      this.terrain,
      this.collision,
      this.placement,
      this.content,
      this.environment,
      { low: 0.5, medium: 0.75, high: 1 }[this.quality.settings.level],
    );
    this.lanterns = new LanternGlow(this.architecture.lights, this.quality.settings);
    this.lanterns.addTo(this.scene);
  }

  private buildNature(): void {
    this.nature = new Nature(this.terrain, this.collision, this.quality.settings, this.placement);
    this.nature.addTo(this.scene);
    this.wildlife = new Wildlife(this.terrain, this.quality.settings.particles);
    this.wildlife.addTo(this.scene);
  }

  private buildWater(): void {
    this.water = new Water(
      this.terrain,
      this.particles,
      this.quality.settings,
      (sj_x, sj_z, sj_s) => this.splash(sj_x, sj_z, sj_s),
    );
    this.water.addTo(this.scene);
  }

  private buildSky(): void {
    this.sky = new Sky();
    this.sky.addTo(this.scene);
    new Mountains(this.quality.settings.level).addTo(this.scene);
    this.lighting = new Lighting(this.scene, this.quality.settings);
    try {
      this.environment = createSkyEnvironment(this.renderer.webgl);
    } catch {
      this.environment = null; // reflections are a nicety only
    }
  }

  private buildPlayer(): void {
    this.panda = new Panda();
    this.scene.add(this.panda.root);
    this.controller = new PlayerController(this.terrain, this.collision);
    this.controller.teleport(sj_PLACES.spawn.x, sj_PLACES.spawn.z, Math.PI);
    this.animator = new PandaAnimator(this.panda, this.controller);
    this.scarf = new ScarfTails(this.panda, Panda.createRibbonMaterial());
    this.scarf.addTo(this.scene);
    this.particles = new Particles(this.scene, Math.round(1400 * this.quality.settings.particles));
    this.wirePlayerEffects();
  }

  private wirePlayerEffects(): void {
    const sj_c = this.controller;
    sj_c.on('land', ({ impact: sj_impact }) => {
      this.animator.land(sj_impact);
      if (sj_impact > 4) this.dustRing(sj_c.position, Math.min(1, sj_impact / 14));
    });
    sj_c.on('splash', ({ x: sj_x, z: sj_z, strength: sj_strength }) => {
      this.splash(sj_x, sj_z, sj_strength);
      this.water?.lake.ripple(sj_x, sj_z, sj_strength * 1.5);
    });
    this.animator.on('step', ({ run: sj_run }) => {
      const sj_s = sj_c.surface;
      if (sj_s === 'dirt' || sj_s === 'sand' || (sj_run && sj_s === 'grass'))
        this.dustPuff(sj_c.position, sj_run ? 0.7 : 0.4);
      if (sj_s === 'water') this.splash(sj_c.position.x, sj_c.position.z, sj_run ? 0.35 : 0.2);
    });
    this.animator.on('paddle', () => this.splash(sj_c.position.x, sj_c.position.z, 0.15));
    this.animator.on('strikeImpact', () => {
      sj_globalUniforms.uShockwave.value.copy(sj_c.position);
      sj_globalUniforms.uShockAge.value = 0;
      this.dustRing(sj_c.position, 0.8);
    });
  }

  dustPuff(sj_at: Vector3, sj_strength: number): void {
    const sj_n = Math.round(2 + sj_strength * 3);
    for (let sj_i = 0; sj_i < sj_n; sj_i++) {
      this.particles.spawn({
        x: sj_at.x + (Math.random() - 0.5) * 0.4,
        y: sj_at.y + 0.05,
        z: sj_at.z + (Math.random() - 0.5) * 0.4,
        vx: (Math.random() - 0.5) * 1.2,
        vy: 0.4 + Math.random() * 0.6,
        vz: (Math.random() - 0.5) * 1.2,
        life: 0.6 + Math.random() * 0.4,
        size: 0.25 * (0.6 + sj_strength),
        sizeEnd: 0.6 * (0.6 + sj_strength),
        color: sj_DUST,
        alpha: 0.45,
        drag: 0.12,
        sprite: sj_SPRITE.puff,
      });
    }
  }

  dustRing(sj_at: Vector3, sj_strength: number): void {
    const sj_n = Math.round(10 + sj_strength * 10);
    for (let sj_i = 0; sj_i < sj_n; sj_i++) {
      const sj_a = (sj_i / sj_n) * Math.PI * 2;
      const sj_sp = 2 + Math.random() * 2 * sj_strength;
      this.particles.spawn({
        x: sj_at.x + Math.cos(sj_a) * 0.3,
        y: sj_at.y + 0.08,
        z: sj_at.z + Math.sin(sj_a) * 0.3,
        vx: Math.cos(sj_a) * sj_sp,
        vy: 0.3 + Math.random() * 0.5,
        vz: Math.sin(sj_a) * sj_sp,
        life: 0.7 + Math.random() * 0.4,
        size: 0.35,
        sizeEnd: 0.9,
        color: sj_DUST,
        alpha: 0.5 * sj_strength + 0.15,
        drag: 0.05,
        sprite: sj_SPRITE.puff,
      });
    }
  }

  splash(sj_x: number, sj_z: number, sj_strength: number): void {
    const sj_n = Math.round(6 + sj_strength * 22);
    for (let sj_i = 0; sj_i < sj_n; sj_i++) {
      const sj_a = Math.random() * Math.PI * 2;
      const sj_sp = (0.6 + Math.random() * 1.8) * (0.5 + sj_strength);
      this.particles.spawn({
        x: sj_x + Math.cos(sj_a) * 0.25,
        y: 0.05,
        z: sj_z + Math.sin(sj_a) * 0.25,
        vx: Math.cos(sj_a) * sj_sp,
        vy: 2 + Math.random() * 3.5 * sj_strength,
        vz: Math.sin(sj_a) * sj_sp,
        life: 0.5 + Math.random() * 0.4,
        size: 0.09 + Math.random() * 0.08,
        sizeEnd: 0.05,
        color: sj_SPLASH,
        alpha: 0.9,
        gravity: 12,
        drag: 0.6,
        sprite: sj_SPRITE.drop,
      });
    }
  }

  /** Called when the visitor presses "Begin" (`quiet`: the tour takes it from here). */
  begin(sj_o: { quiet?: boolean } = {}): void {
    if (this.started) return;
    this.started = true;
    this.rig.startFollow(
      this.controller.position,
      this.controller.yaw,
      this.reducedMotion ? 0.01 : 2.6,
    );
    this.input.lastActivity = performance.now();
    if (!sj_o.quiet)
      window.setTimeout(() => this.animator.play('wave'), this.reducedMotion ? 100 : 2300);
    this.emit('started', undefined);
  }

  private onResize = (): void => {
    const sj_w = window.innerWidth;
    const sj_h = window.innerHeight;
    this.renderer.resize(sj_w, sj_h);
    const sj_px = sj_h * this.renderer.webgl.getPixelRatio();
    this.particles?.setViewport(sj_px, this.rig.camera.fov);
    this.nature?.ambient.setViewport(sj_px, this.rig.camera.fov);
    this.lanterns?.setViewport(sj_px, this.rig.camera.fov);
  };

  private tick = (
    sj_dt: number,
    sj_elapsed: number,
    sj_frameTime: number,
    sj_render = true,
  ): void => {
    sj_globalUniforms.uTime.value = sj_elapsed;
    sj_globalUniforms.uShockAge.value += sj_dt;
    if (sj_render) this.quality.monitor(sj_frameTime);
    this.input.update();

    const sj_driver = this.driver;
    const sj_playing = this.started && !this.uiBlocking;
    this.input.gameplayEnabled = sj_playing;
    this.controller.locked = !sj_playing;
    if (sj_driver) {
      // The tour walks the panda; visitor input is only watched (to hand control back).
      const sj_d = sj_driver.steer(sj_dt);
      this.controller.update(sj_dt, sj_d.move, 0, sj_d.run, sj_d.jump ?? false);
    } else {
      const sj_jump = sj_playing && this.input.consume('jump');
      this.controller.update(sj_dt, this.input.move, this.rig.yaw, this.input.run, sj_jump);
    }
    this.panda.root.position.copy(this.controller.position);
    this.panda.root.rotation.y = this.controller.yaw;
    this.animator.update(
      sj_dt,
      sj_driver ? sj_driver.idleSeconds : sj_playing ? this.input.idleSeconds : 0,
    );
    sj_globalUniforms.uPlayerPos.value.copy(this.controller.position);
    this.scarf.update(
      sj_dt,
      sj_globalUniforms.uWindDir.value,
      sj_globalUniforms.uWindStrength.value,
      sj_elapsed,
    );

    for (const sj_f of this.beforeCamera) sj_f(sj_dt);
    const sj_manual = this.started && !sj_driver;
    this.rig.update(
      sj_dt,
      this.controller,
      sj_manual ? this.input.look : sj_NO_LOOK,
      sj_manual ? this.input.zoom : 0,
    );
    const sj_cam = this.rig.camera;
    this.sky.update(sj_cam.position);
    if (this.started) sj_tmp.copy(this.controller.position);
    else sj_tmp.set(sj_PLACES.crossroads.x, 2, sj_PLACES.crossroads.z);
    this.lighting.update(sj_tmp);
    this.water.update(sj_dt, sj_elapsed, this.controller, this.quality.settings.particles);
    this.architecture.update(sj_dt, this.controller.position, this.rig.camera.position);
    this.lanterns.update(sj_dt, sj_elapsed, this.controller.position);
    this.wildlife.update(sj_dt, sj_elapsed, this.controller.position);
    for (const sj_u of this.updaters) sj_u(sj_dt, sj_elapsed);
    this.particles.update(sj_dt, sj_elapsed);

    if (!sj_render) return;
    if (!this.renderPaused) this.renderer.render(sj_dt);
    this.debug.update(sj_frameTime, this.renderer.info);
    this.input.endFrame();
  };
}
