import { Color, Vector3 } from 'three';
import type { App } from './App';
import { Progress } from '../zones/Progress';
import { buildInteractables, Zones, type Interactable } from '../zones/Zones';
import { Beacons } from '../zones/Beacons';
import { CEREMONY_MS, DiscoveryFx } from '../effects/Discovery';
import { SkyLanterns } from '../effects/SkyLanterns';
import { SPRITE } from '../effects/Particles';
import { Hud } from '../ui/Hud';
import { ScrollPanel } from '../ui/ScrollPanel';
import { MapPanel } from '../ui/MapPanel';
import { Menu } from '../ui/Menu';
import { ClassicView } from '../ui/ClassicView';
import { TouchControls } from '../ui/TouchControls';
import { SECTIONS, sectionMeta, type SectionId } from '../content/sections';
import type { GameAudio } from '../audio/GameAudio';
import { globalUniforms } from '../render/uniforms';
import { BELL_ROT, HOUSES, PAVILION_ROT, PLACES, TRAVEL_POINTS } from '../world/layout';
import { Tour, type TourHost } from '../tour/Tour';

const CLOUD = new Color('#fdf8ef');
const tmp = new Vector3();

/**
 * Gameplay layer on top of the engine: interactive spots, the discovery moment, scroll
 * panels, the map with quick travel, the menu, touch controls and all sound cues.
 */
export class Game {
  readonly progress = new Progress();
  readonly zones: Zones;
  readonly hud: Hud;
  readonly scroll: ScrollPanel;
  readonly map: MapPanel;
  readonly menu: Menu;
  readonly classic: ClassicView;
  readonly touch: TouchControls;
  /** "Watch the tour": the valley as a short film */
  readonly tour: Tour;
  private beacons: Beacons;
  private discovery: DiscoveryFx;
  private lanterns: SkyLanterns;
  private moved = false;
  private busyUntil = 0;
  private lastStrikeHit = 0;
  /** seconds of actual play (no panel open), for gentle hints */
  private playTime = 0;
  private tips = { beacons: false, map: false };
  /** gameplay timers (ceremony, bell, dummy); cancelled by quick travel and reset */
  private pending = new Set<number>();

  constructor(
    private readonly app: App,
    private readonly audio: GameAudio,
    ui: HTMLElement,
    classic: ClassicView,
  ) {
    const content = app.content;
    this.zones = new Zones(buildInteractables(app.architecture.anchors, content));
    this.beacons = new Beacons(app.scene, this.zones, this.progress);
    this.discovery = new DiscoveryFx(app.scene, app.particles);
    this.lanterns = new SkyLanterns(app.scene);

    this.hud = new Hud(ui, content, this.progress);
    this.scroll = new ScrollPanel(ui, content, this.progress);
    this.map = new MapPanel(
      ui,
      app.terrain,
      app.nature.treeSpots,
      [
        ...HOUSES.map((h) => ({
          x: h.x,
          z: h.z,
          w: h.width + 1,
          d: h.depth + 1,
          rot: h.rot,
          color: h.style === 'house' ? '#6d7680' : '#3f8a7c',
        })),
        { x: PLACES.pagoda.x, z: PLACES.pagoda.z, w: 7, d: 7, rot: 0, color: '#b8352b', sides: 8 },
        {
          x: PLACES.pavilion.x,
          z: PLACES.pavilion.z,
          w: 7.6,
          d: 7.6,
          rot: PAVILION_ROT,
          color: '#5a6470',
          sides: 6,
        },
        { x: PLACES.bell.x, z: PLACES.bell.z, w: 4, d: 4, rot: BELL_ROT, color: '#5a6470' },
        { x: PLACES.gate.x, z: PLACES.gate.z, w: 10, d: 1.2, rot: 0, color: '#b8352b' },
      ],
      SECTIONS.map((s) => {
        const p = this.zones.primary(s.id)!;
        return { section: s.id, x: p.x, z: p.z };
      }),
      this.progress,
      content.site.title,
    );
    this.menu = new Menu(ui, {
      quality: app.quality.settings.level,
      sourceUrl: content.site.sourceUrl,
    });
    this.classic = classic;
    this.touch = new TouchControls(ui, app.input);
    this.tour = new Tour(app, this.tourHost(), ui);

    this.wire();
    app.updaters.push((dt, t) => this.update(dt, t));
  }

  /** Called when the visitor presses Begin (or Watch the tour). */
  start(o: { tour?: boolean } = {}): void {
    this.hud.show();
    this.hud.setSound(!this.audio.muted);
    this.hud.setMusic(this.audio.musicOn);
    if (o.tour) {
      this.tour.start();
      return;
    }
    window.setTimeout(() => {
      if (!this.progress.has('welcome') && !this.tour.running)
        this.hud.toast('Walk through the gate to begin');
    }, 3200);
  }

  /** What the tour may do with the game. */
  private tourHost(): TourHost {
    return {
      scrollOpen: () => this.scroll.isOpen,
      openScroll: (section, focus, rise) => {
        this.map.close();
        this.menu.close();
        // (no rise when tests fast-forward the film: it runs on wall-clock time)
        const from = rise && this.app.loop.substeps === 1 ? this.pandaOnScreen() : undefined;
        return this.scroll.open(section, focus, from);
      },
      closeScroll: () => this.scroll.close(),
      scrollBody: () => (this.scroll.isOpen ? this.scroll.bodyEl : null),
      ceremony: (section) => {
        this.progress.discover(section);
        this.celebrate(section);
      },
      strikeDummy: (i) => this.strikeDummy(i),
      beatDrum: () => this.beatDrum(),
      ringBell: (onGong) => this.ringBell(onGong),
      closePanels: () => {
        this.scroll.close();
        this.map.close();
        this.menu.close();
      },
      setTouring: (on) => {
        this.cancelPending();
        this.app.rig.endShot();
        this.hud.setTouring(on);
        this.scroll.setFilm(on);
        if (on) {
          this.scroll.close();
          this.map.close();
          this.menu.close();
          // Whatever button started the film must not keep Space and Enter.
          const active = document.activeElement;
          if (active instanceof HTMLElement) active.blur();
        }
      },
      toast: (text) => this.hud.toast(text, true),
      sound: (name) => this.audio.sfx(name),
      openClassic: () => this.classic.open(),
    };
  }

  /** setTimeout that quick travel and progress reset can cancel. */
  private later(fn: () => void, ms: number): void {
    const id = window.setTimeout(() => {
      this.pending.delete(id);
      fn();
    }, ms);
    this.pending.add(id);
  }

  private cancelPending(): void {
    for (const id of this.pending) window.clearTimeout(id);
    this.pending.clear();
  }

  private get panelOpen(): boolean {
    return this.scroll.isOpen || this.map.isOpen || this.menu.isOpen || this.classic.isOpen;
  }

  private wire(): void {
    const app = this.app;
    const input = app.input;
    const audio = this.audio;

    input.on('action', (a) => {
      if (!app.started) return;
      if (this.tour.running) {
        if (a === 'mute') this.toggleSound();
        else if (!this.classic.isOpen) this.tour.onAction(a);
        return;
      }
      if (a === 'escape') {
        if (this.scroll.isOpen) this.scroll.close();
        else if (this.map.isOpen) this.map.close();
        else if (this.menu.isOpen) this.menu.close();
        else if (this.classic.isOpen) this.classic.close();
        else this.menu.open();
        return;
      }
      if (a === 'map') {
        this.toggleMap();
        return;
      }
      if (a === 'mute') {
        this.toggleSound();
        return;
      }
      if (this.scroll.isOpen) {
        if (a === 'next') this.scroll.step(1);
        if (a === 'prev') this.scroll.step(-1);
        return;
      }
      if (this.panelOpen) return;
      if (a === 'interact') this.zones.interact('E');
      if (a === 'strike') this.onStrike();
      if (a === 'help') this.openSection('welcome');
    });
    input.on('any', () => {
      if (!this.moved && app.started && input.move.lengthSq() > 0.01) {
        this.moved = true;
        window.setTimeout(() => this.hud.fadeHints(), 4000);
      }
    });

    this.zones.on('focus', (it) => {
      this.hud.setPrompt(it ? it.prompt : null, it?.key ?? 'E', input.usingTouch);
      app.animator.lookTarget = it ? { x: it.x, y: it.y + 0.8, z: it.z } : null;
    });
    this.zones.on('trigger', (it) => this.onTrigger(it));
    this.zones.shouldAutoFire = (it) => !!it.section && !this.progress.has(it.section);

    this.hud.on('prompt', () => this.zones.interact('E'));
    this.hud.on('map', () => this.toggleMap());
    this.hud.on('sound', () => this.toggleSound());
    this.hud.on('music', () => {
      audio.setMusic(!audio.musicOn);
      this.hud.setMusic(audio.musicOn);
    });
    this.hud.on('menu', () => {
      this.scroll.close();
      this.map.close();
      this.menu.toggle();
    });
    this.hud.on('seal', (id) => this.openSection(id));

    this.scroll.on('open', () => audio.sfx('open'));
    this.scroll.on('close', () => {
      audio.sfx('close');
      app.rig.endShot();
      if (!this.tips.beacons && this.progress.count === 1 && this.progress.has('welcome')) {
        this.tips.beacons = true;
        window.setTimeout(
          () => this.hud.toast('Golden beacons mark the scrolls still hidden'),
          800,
        );
      }
    });
    this.scroll.on('switch', () => audio.sfx('ui'));
    this.scroll.on('project', () => audio.sfx('ui'));
    this.scroll.on('travel', (id) => !this.tour.running && this.travelTo(id));
    this.map.on('travel', (id) => this.travelTo(id));
    this.menu.on('quality', (q) => app.quality.set(q));
    app.quality.on('change', (s) => this.menu.setQuality(s.level));
    this.menu.on('classic', () => this.classic.open());
    this.menu.on('tour', () => this.tour.start());
    this.menu.on('help', () => this.openSection('welcome'));
    this.menu.on('reset', () => {
      this.cancelPending(); // including a ceremony in progress: release its camera shot
      app.rig.endShot();
      this.progress.reset();
      this.hud.toast('The scrolls are hidden again');
    });

    // Player sounds.
    const c = app.controller;
    c.on('jump', () => audio.sfx('jump'));
    c.on('land', ({ impact }) => audio.sfx('land', { volume: Math.min(1, impact / 10) }));
    c.on('splash', ({ strength }) => audio.sfx('splash', { volume: strength }));
    c.on('bump', ({ tag }) => {
      if (tag === 'bamboo') audio.sfx('rustle', { volume: 0.5 });
    });
    app.animator.on('step', ({ run }) => audio.footstep(c.surface, run));
    app.animator.on('paddle', () => audio.sfx('swim'));
    app.animator.on('strikeWhoosh', () => audio.sfx('whoosh'));
    app.animator.on('meditateStart', () => audio.sfx('chime'));
  }

  private toggleMap(): void {
    if (this.classic.isOpen) return;
    this.scroll.close();
    this.menu.close();
    this.map.toggle();
    this.audio.sfx(this.map.isOpen ? 'open' : 'close');
  }

  private toggleSound(): void {
    this.audio.setMuted(!this.audio.muted);
    this.hud.setSound(!this.audio.muted);
  }

  /** F: spin-kick, and hit whatever is in reach (dummy, drum, bell). */
  private onStrike(): void {
    const app = this.app;
    if (app.controller.swimming) return;
    if (!app.animator.play('strike')) return;
    const it = this.zones.active;
    if (it && (it.kind === 'dummy' || it.kind === 'drum' || it.kind === 'bell')) {
      window.setTimeout(() => this.onTrigger(it, true), 0);
    }
  }

  private onTrigger(it: Interactable, fromStrike = false): void {
    const now = performance.now();
    if (now < this.busyUntil) return;
    const app = this.app;
    switch (it.kind) {
      case 'gate':
      case 'scroll':
      case 'banner':
      case 'milestone':
        this.discoverOrOpen(it.section!, it.focus, it);
        break;
      case 'dummy': {
        if (!fromStrike && !app.animator.play('strike')) return;
        const index = it.focus ?? 0;
        if (now - this.lastStrikeHit < 450) return;
        this.lastStrikeHit = now;
        this.later(() => {
          const p = app.controller.position;
          app.architecture.training.hit(index, p.x, p.z, 1);
          this.audio.sfx('thwack', { x: it.x, z: it.z });
          app.dustRing(tmp.set(it.x, it.y + 0.2, it.z), 0.5);
          if (!this.progress.has('skills')) {
            this.later(() => {
              if (this.panelOpen) this.discoverQuietly('skills');
              else this.discoverOrOpen('skills', index, it);
            }, 350);
          } else {
            const g = app.content.skills.groups[index];
            if (g) this.hud.toast(`${g.name}: ${g.items.map((x) => x.name).join(' · ')}`);
          }
        }, 330);
        break;
      }
      case 'drum': {
        if (!fromStrike) app.animator.play('strike');
        // land the sound on the kick's impact frame
        this.later(() => {
          this.audio.sfx('drum', { x: it.x, z: it.z });
          app.dustRing(tmp.set(it.x, it.y - 1, it.z), 0.9);
          globalUniforms.uShockwave.value.set(it.x, it.y - 1, it.z);
          globalUniforms.uShockAge.value = 0;
        }, 330);
        break;
      }
      case 'bell': {
        const rang = this.ringBell(() => {
          this.later(() => {
            if (this.panelOpen) this.discoverQuietly('contact');
            else this.discoverOrOpen('contact', undefined, it);
          }, 1300);
        });
        if (rang) this.busyUntil = now + 900;
        break;
      }
    }
  }

  /** Swings the striker into the bell: gong, sky lanterns, a shudder. */
  private ringBell(onGong?: () => void): boolean {
    const app = this.app;
    const bell = this.zones.find('bell')!;
    return app.architecture.ringBell(() => {
      this.audio.sfx('gong', { x: bell.x, z: bell.z });
      this.lanterns.release({ x: bell.x, y: bell.y + 1, z: bell.z }, 14);
      app.rig.shake(0.35);
      onGong?.();
    });
  }

  /** A spin-kick that lands on training dummy `index` (the tour's strikes). */
  private strikeDummy(index: number): void {
    const app = this.app;
    const d = app.architecture.training.dummies[index];
    if (!d || !app.animator.play('strike')) return;
    const off = app.animator.on('strikeImpact', () => {
      off();
      const p = app.controller.position;
      app.architecture.training.hit(index, p.x, p.z, 1);
      this.audio.sfx('thwack', { x: d.x, z: d.z });
      app.dustRing(tmp.set(d.x, d.y + 0.2, d.z), 0.5);
    });
  }

  /** A kick on the big drum: boom and a shock-wave through the grass. */
  private beatDrum(): void {
    const app = this.app;
    const drum = app.architecture.anchors.drum;
    if (!app.animator.play('strike')) return;
    const off = app.animator.on('strikeImpact', () => {
      off();
      this.audio.sfx('drum', { x: drum.x, z: drum.z });
      app.dustRing(tmp.set(drum.x, drum.y - 1, drum.z), 0.9);
      globalUniforms.uShockwave.value.set(drum.x, drum.y - 1, drum.z);
      globalUniforms.uShockAge.value = 0;
    });
  }

  /** The discovery moment itself: bow, light, golden ink, seal, bloom. */
  private celebrate(section: SectionId): void {
    const app = this.app;
    app.controller.velocity.set(0, 0, 0);
    app.animator.play('bow');
    this.discovery.play(app.controller.position, 1);
    this.audio.sfx('discover');
    this.hud.stamp(section);
    app.renderer.pulseBloom(1.2);
  }

  /** First visit: the discovery ceremony. Later: straight to the scroll. */
  private discoverOrOpen(section: SectionId, focus: number | undefined, at?: Interactable): void {
    const app = this.app;
    if (this.progress.discover(section)) {
      this.busyUntil = performance.now() + 2700;
      this.celebrate(section);
      this.frameShot(at, 1.6);
      // The scroll waits for the bow and the golden light, then rises out of the panda.
      this.later(() => {
        // If the visitor opened the map or menu meanwhile, the scroll waits in the tabs
        // and the camera goes back to following the panda.
        if (this.panelOpen) app.rig.endShot();
        else this.scroll.open(section, focus, this.pandaOnScreen());
        this.announce(section);
      }, CEREMONY_MS);
    } else {
      this.frameShot(at, 1.1);
      this.scroll.open(section, focus);
    }
  }

  /** Where the panda's chest is on screen (CSS pixels), or undefined if out of view. */
  private pandaOnScreen(): { x: number; y: number } | undefined {
    const c = this.app.controller.position;
    const v = tmp.set(c.x, c.y + 1.0, c.z).project(this.app.rig.camera);
    if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) return undefined;
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
  }

  /** A delayed discovery that lands while a panel is open: record it without the show. */
  private discoverQuietly(section: SectionId): void {
    if (!this.progress.discover(section)) return;
    this.audio.sfx('discover');
    this.announce(section);
  }

  private announce(section: SectionId): void {
    const { count, total } = this.progress;
    this.hud.toast(`New scroll: ${sectionMeta(section).label} (${count}/${total})`);
    if (count === total) {
      this.later(() => this.hud.toast('Every scroll found. Thank you for visiting!'), 1600);
    }
  }

  /** Eases the camera into a three-quarter view of the panda and the landmark. */
  private frameShot(at: Interactable | undefined, duration: number): void {
    const app = this.app;
    const p = app.controller.position;
    const spot = at ?? { x: p.x, y: p.y, z: p.z + 1 };
    const dx = p.x - spot.x;
    const dz = p.z - spot.z;
    const len = Math.hypot(dx, dz) || 1;
    const ang = Math.atan2(dx / len, dz / len) + 0.75;
    const target = new Vector3((p.x + spot.x) / 2, Math.max(p.y, spot.y) + 1.1, (p.z + spot.z) / 2);
    const position = new Vector3(p.x + Math.sin(ang) * 6.5, p.y + 3.2, p.z + Math.cos(ang) * 6.5);
    const ground = app.terrain.heightAt(position.x, position.z) + 1;
    position.y = Math.max(position.y, ground);
    app.rig.playShot({ position, target }, duration);
  }

  openSection(id: SectionId): void {
    this.map.close();
    this.menu.close();
    this.scroll.open(id);
  }

  /** Quick travel with a puff of cloud. */
  travelTo(id: SectionId): void {
    const app = this.app;
    const dest = TRAVEL_POINTS[id];
    this.cancelPending();
    this.scroll.close();
    this.map.close();
    this.audio.sfx('travel');
    this.puff(app.controller.position);
    app.controller.teleport(dest.x, dest.z, dest.yaw);
    app.scarf.snap();
    app.rig.startFollow(app.controller.position, dest.yaw, 0.01);
    window.setTimeout(() => this.puff(app.controller.position), 60);
  }

  private puff(at: Vector3): void {
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      this.app.particles.spawn({
        x: at.x + Math.cos(a) * 0.5,
        y: at.y + 0.3 + Math.random() * 1.2,
        z: at.z + Math.sin(a) * 0.5,
        vx: Math.cos(a) * 2.2,
        vy: 0.6 + Math.random(),
        vz: Math.sin(a) * 2.2,
        life: 0.9 + Math.random() * 0.5,
        size: 0.7,
        sizeEnd: 1.6,
        color: CLOUD,
        alpha: 0.8,
        drag: 0.08,
        sprite: SPRITE.puff,
      });
    }
  }

  update(dt: number, time: number): void {
    const app = this.app;
    const touring = this.tour.running;
    this.tour.update(dt);
    if (app.started && !this.panelOpen && !touring) this.playTime += dt;
    if (!this.tips.map && this.playTime > 75 && this.progress.count < 3) {
      this.tips.map = true;
      this.hud.toast(
        app.input.usingTouch
          ? 'Tip: the map button shows every landmark'
          : 'Tip: press M for the map and quick travel',
      );
    }
    app.uiBlocking = this.panelOpen;
    app.renderPaused = this.classic.isOpen;
    this.touch.setEnabled(!this.panelOpen && app.started && !touring);
    const p = app.controller.position;
    this.zones.update(
      p,
      app.started && !this.panelOpen && !touring && performance.now() > this.busyUntil,
    );
    this.beacons.update(time, p, touring);
    this.discovery.update(dt);
    this.lanterns.update(dt, globalUniforms.uWindDir.value);
    this.map.update(p.x, p.z, app.controller.yaw);
    this.audio.update(dt, {
      camera: app.rig.camera,
      player: p,
      swimming: app.controller.swimming,
      meditating: app.animator.meditating,
      panelOpen: this.panelOpen,
      waterfall: app.water.waterfall.bottom,
    });
  }
}
