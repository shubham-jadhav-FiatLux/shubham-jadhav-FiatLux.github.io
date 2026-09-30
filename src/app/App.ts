import { Color, Fog, Scene, Vector3 } from 'three';
import { Debug } from '../core/Debug';
import { Emitter } from '../core/Emitter';
import { Input } from '../core/Input';
import { Loop } from '../core/Loop';
import { Quality } from '../core/Quality';
import { Renderer } from '../render/Renderer';
import { installAtmosphericFog } from '../render/fog';
import { ATMOSPHERE } from '../render/atmosphere';
import { globalUniforms } from '../render/uniforms';
import { CameraRig } from '../camera/CameraRig';
import { CollisionWorld } from '../physics/CollisionWorld';
import { Terrain } from '../world/Terrain';
import { Sky } from '../world/Sky';
import { Mountains } from '../world/Mountains';
import { Lighting } from '../world/Lighting';
import { PLACES } from '../world/layout';
import { Panda } from '../player/Panda';
import { PandaAnimator } from '../player/PandaAnimator';
import { PlayerController } from '../player/PlayerController';
import { ScarfTails } from '../player/ScarfTails';
import { Particles, SPRITE } from '../effects/Particles';
import { Grass } from '../world/nature/Grass';
import { Nature } from '../world/nature/Nature';
import { Water } from '../world/water/Water';
import { Architecture } from '../world/architecture/Architecture';
import { Placement } from '../world/placement';
import { portfolio } from '../content/portfolio';
import type { PortfolioContent } from '../content/types';

export type AppEvents = {
  ready: void;
  started: void;
};

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

const DUST = new Color('#d9c4a0');
const SPLASH = new Color('#e8f6f4');
const tmp = new Vector3();

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
  readonly updaters: ((dt: number, elapsed: number) => void)[] = [];
  private reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly content: PortfolioContent = portfolio,
  ) {
    super();
    installAtmosphericFog();
    this.scene.fog = new Fog(ATMOSPHERE.fogColor, ATMOSPHERE.fogNear, ATMOSPHERE.fogFar);
    this.scene.background = ATMOSPHERE.fogColor.clone();
    this.input = new Input(canvas);
    this.rig = new CameraRig(window.innerWidth / window.innerHeight, (x, z) =>
      this.terrain ? this.terrain.heightAt(x, z) : 0,
    );
    this.rig.reducedMotion = this.reducedMotion;
    this.renderer = new Renderer(canvas, this.scene, this.rig.camera, this.quality.settings);
    this.loop = new Loop(this.tick);
    this.quality.on('change', (s) => {
      this.renderer.applyQuality(s);
      this.lighting?.applyQuality(s);
      this.grass?.applyQuality(s);
      this.onResize();
    });
    this.quality.on('scale', (k) => {
      this.renderer.setRenderScale(k);
      this.onResize();
    });
    window.addEventListener('resize', this.onResize);
  }

  /** Builds the world step by step so the loading bar can breathe between steps. */
  async load(progress: (fraction: number, label: string) => void): Promise<void> {
    await this.debug.init();
    // Canvas textures (signboards, banners, labels) need the brush font loaded first.
    try {
      await Promise.all([
        document.fonts.load("64px 'Brush'", this.content.site.gateGlyphs + 'Aa一'),
        document.fonts.load("700 32px 'Cormorant Garamond'"),
      ]);
    } catch {
      /* fall back to system fonts */
    }
    const steps: [string, () => void][] = [
      ['Shaping the valley', () => this.buildTerrain()],
      ['Raising the mountains', () => this.buildSky()],
      ['Building the pagoda', () => this.buildArchitecture()],
      ['Growing bamboo and blossoms', () => this.buildNature()],
      ['Waking the panda', () => this.buildPlayer()],
      ['Filling the lake', () => this.buildWater()],
      ['Finishing touches', () => this.terrain.mask.commit()],
    ];
    for (let i = 0; i < steps.length; i++) {
      const [label, run] = steps[i]!;
      progress(i / (steps.length + 1), label);
      await nextFrame();
      run();
    }
    progress(steps.length / (steps.length + 1), 'Preparing shaders');
    await nextFrame();
    this.onResize();
    try {
      await this.renderer.webgl.compileAsync(this.scene, this.rig.camera);
    } catch {
      /* compileAsync is an optimisation only */
    }
    progress(1, 'Ready');
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
    );
  }

  private buildNature(): void {
    this.nature = new Nature(this.terrain, this.collision, this.quality.settings, this.placement);
    this.nature.addTo(this.scene);
  }

  private buildWater(): void {
    this.water = new Water(this.terrain, this.particles, this.quality.settings, (x, z, s) =>
      this.splash(x, z, s),
    );
    this.water.addTo(this.scene);
  }

  private buildSky(): void {
    this.sky = new Sky();
    this.sky.addTo(this.scene);
    new Mountains().addTo(this.scene);
    this.lighting = new Lighting(this.scene, this.quality.settings);
  }

  private buildPlayer(): void {
    this.panda = new Panda();
    this.scene.add(this.panda.root);
    this.controller = new PlayerController(this.terrain, this.collision);
    this.controller.teleport(PLACES.spawn.x, PLACES.spawn.z, Math.PI);
    this.animator = new PandaAnimator(this.panda, this.controller);
    this.scarf = new ScarfTails(this.panda, Panda.createRibbonMaterial());
    this.scarf.addTo(this.scene);
    this.particles = new Particles(this.scene, Math.round(1400 * this.quality.settings.particles));
    this.wirePlayerEffects();
  }

  private wirePlayerEffects(): void {
    const c = this.controller;
    c.on('land', ({ impact }) => {
      this.animator.land(impact);
      if (impact > 4) this.dustRing(c.position, Math.min(1, impact / 14));
    });
    c.on('splash', ({ x, z, strength }) => {
      this.splash(x, z, strength);
      this.water?.lake.ripple(x, z, strength * 1.5);
    });
    this.animator.on('step', ({ run }) => {
      const s = c.surface;
      if (s === 'dirt' || s === 'sand' || (run && s === 'grass'))
        this.dustPuff(c.position, run ? 0.7 : 0.4);
      if (s === 'water') this.splash(c.position.x, c.position.z, run ? 0.35 : 0.2);
    });
    this.animator.on('paddle', () => this.splash(c.position.x, c.position.z, 0.15));
    this.animator.on('strikeImpact', () => {
      globalUniforms.uShockwave.value.copy(c.position);
      globalUniforms.uShockAge.value = 0;
      this.dustRing(c.position, 0.8);
    });
  }

  dustPuff(at: Vector3, strength: number): void {
    const n = Math.round(2 + strength * 3);
    for (let i = 0; i < n; i++) {
      this.particles.spawn({
        x: at.x + (Math.random() - 0.5) * 0.4,
        y: at.y + 0.05,
        z: at.z + (Math.random() - 0.5) * 0.4,
        vx: (Math.random() - 0.5) * 1.2,
        vy: 0.4 + Math.random() * 0.6,
        vz: (Math.random() - 0.5) * 1.2,
        life: 0.6 + Math.random() * 0.4,
        size: 0.25 * (0.6 + strength),
        sizeEnd: 0.6 * (0.6 + strength),
        color: DUST,
        alpha: 0.45,
        drag: 0.12,
        sprite: SPRITE.puff,
      });
    }
  }

  dustRing(at: Vector3, strength: number): void {
    const n = Math.round(10 + strength * 10);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sp = 2 + Math.random() * 2 * strength;
      this.particles.spawn({
        x: at.x + Math.cos(a) * 0.3,
        y: at.y + 0.08,
        z: at.z + Math.sin(a) * 0.3,
        vx: Math.cos(a) * sp,
        vy: 0.3 + Math.random() * 0.5,
        vz: Math.sin(a) * sp,
        life: 0.7 + Math.random() * 0.4,
        size: 0.35,
        sizeEnd: 0.9,
        color: DUST,
        alpha: 0.5 * strength + 0.15,
        drag: 0.05,
        sprite: SPRITE.puff,
      });
    }
  }

  splash(x: number, z: number, strength: number): void {
    const n = Math.round(6 + strength * 22);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.6 + Math.random() * 1.8) * (0.5 + strength);
      this.particles.spawn({
        x: x + Math.cos(a) * 0.25,
        y: 0.05,
        z: z + Math.sin(a) * 0.25,
        vx: Math.cos(a) * sp,
        vy: 2 + Math.random() * 3.5 * strength,
        vz: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.4,
        size: 0.09 + Math.random() * 0.08,
        sizeEnd: 0.05,
        color: SPLASH,
        alpha: 0.9,
        gravity: 12,
        drag: 0.6,
        sprite: SPRITE.drop,
      });
    }
  }

  /** Called when the visitor presses "Begin". */
  begin(): void {
    if (this.started) return;
    this.started = true;
    this.rig.startFollow(
      this.controller.position,
      this.controller.yaw,
      this.reducedMotion ? 0.01 : 2.6,
    );
    this.input.lastActivity = performance.now();
    window.setTimeout(() => this.animator.play('wave'), this.reducedMotion ? 100 : 2300);
    this.emit('started', undefined);
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.resize(w, h);
    const px = h * this.renderer.webgl.getPixelRatio();
    this.particles?.setViewport(px, this.rig.camera.fov);
    this.nature?.ambient.setViewport(px, this.rig.camera.fov);
  };

  private tick = (dt: number, elapsed: number, frameTime: number): void => {
    globalUniforms.uTime.value = elapsed;
    globalUniforms.uShockAge.value += dt;
    this.quality.monitor(frameTime);
    this.input.update();

    const playing = this.started && !this.uiBlocking;
    this.input.gameplayEnabled = playing;
    const jump = playing && this.input.consume('jump');

    this.controller.locked = !playing;
    this.controller.update(dt, this.input.move, this.rig.yaw, this.input.run, jump);
    this.panda.root.position.copy(this.controller.position);
    this.panda.root.rotation.y = this.controller.yaw;
    this.animator.update(dt, playing ? this.input.idleSeconds : 0);
    globalUniforms.uPlayerPos.value.copy(this.controller.position);
    this.scarf.update(
      dt,
      globalUniforms.uWindDir.value,
      globalUniforms.uWindStrength.value,
      elapsed,
    );

    this.rig.update(
      dt,
      this.controller,
      this.started ? this.input.look : { x: 0, y: 0 },
      this.started ? this.input.zoom : 0,
    );
    const cam = this.rig.camera;
    this.sky.update(cam.position);
    if (this.started) tmp.copy(this.controller.position);
    else tmp.set(PLACES.crossroads.x, 2, PLACES.crossroads.z);
    this.lighting.update(tmp);
    this.water.update(dt, elapsed, this.controller, this.quality.settings.particles);
    this.architecture.update(dt, this.controller.position);
    for (const u of this.updaters) u(dt, elapsed);
    this.particles.update(dt, elapsed);

    if (!this.renderPaused) this.renderer.render(dt);
    this.debug.update(frameTime, this.renderer.info);
    this.input.endFrame();
  };
}
