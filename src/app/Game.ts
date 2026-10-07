import { Color, Vector3 } from 'three';
import type { App } from './App';
import { Progress } from '../zones/Progress';
import { buildInteractables, Zones, type Interactable } from '../zones/Zones';
import { Beacons } from '../zones/Beacons';
import { sj_CEREMONY_MS, DiscoveryFx } from '../effects/Discovery';
import { SkyLanterns } from '../effects/SkyLanterns';
import { sj_SPRITE } from '../effects/Particles';
import { Hud } from '../ui/Hud';
import { ScrollPanel } from '../ui/ScrollPanel';
import { MapPanel } from '../ui/MapPanel';
import { Menu } from '../ui/Menu';
import { ClassicView } from '../ui/ClassicView';
import { TouchControls } from '../ui/TouchControls';
import { sj_SECTIONS, sectionMeta, type SectionId } from '../content/sections';
import type { GameAudio } from '../audio/GameAudio';
import { sj_globalUniforms } from '../render/uniforms';
import {
  sj_BELL_ROT,
  sj_HOUSES,
  sj_PAVILION_ROT,
  sj_PLACES,
  sj_TRAVEL_POINTS,
} from '../world/layout';
import { Tour, type TourHost } from '../tour/Tour';

const sj_CLOUD = new Color('#fdf8ef');
const sj_tmp = new Vector3();

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
    sj_ui: HTMLElement,
    sj_classic: ClassicView,
  ) {
    const sj_content = app.content;
    this.zones = new Zones(buildInteractables(app.architecture.anchors, sj_content));
    this.beacons = new Beacons(app.scene, this.zones, this.progress);
    this.discovery = new DiscoveryFx(app.scene, app.particles);
    this.lanterns = new SkyLanterns(app.scene);

    this.hud = new Hud(sj_ui, sj_content, this.progress);
    this.scroll = new ScrollPanel(sj_ui, sj_content, this.progress);
    this.map = new MapPanel(
      sj_ui,
      app.terrain,
      app.nature.treeSpots,
      [
        ...sj_HOUSES.map((sj_h) => ({
          x: sj_h.x,
          z: sj_h.z,
          w: sj_h.width + 1,
          d: sj_h.depth + 1,
          rot: sj_h.rot,
          color: sj_h.style === 'house' ? '#6d7680' : '#3f8a7c',
        })),
        {
          x: sj_PLACES.pagoda.x,
          z: sj_PLACES.pagoda.z,
          w: 7,
          d: 7,
          rot: 0,
          color: '#b8352b',
          sides: 8,
        },
        {
          x: sj_PLACES.pavilion.x,
          z: sj_PLACES.pavilion.z,
          w: 7.6,
          d: 7.6,
          rot: sj_PAVILION_ROT,
          color: '#5a6470',
          sides: 6,
        },
        {
          x: sj_PLACES.bell.x,
          z: sj_PLACES.bell.z,
          w: 4,
          d: 4,
          rot: sj_BELL_ROT,
          color: '#5a6470',
        },
        { x: sj_PLACES.gate.x, z: sj_PLACES.gate.z, w: 10, d: 1.2, rot: 0, color: '#b8352b' },
      ],
      sj_SECTIONS.map((sj_s) => {
        const sj_p = this.zones.primary(sj_s.id)!;
        return { section: sj_s.id, x: sj_p.x, z: sj_p.z };
      }),
      this.progress,
      sj_content.site.title,
    );
    this.menu = new Menu(sj_ui, {
      quality: app.quality.settings.level,
      sourceUrl: sj_content.site.sourceUrl,
    });
    this.classic = sj_classic;
    this.touch = new TouchControls(sj_ui, app.input);
    this.tour = new Tour(app, this.tourHost(), sj_ui);

    this.wire();
    app.updaters.push((sj_dt, sj_t) => this.update(sj_dt, sj_t));
  }

  /** Called when the visitor presses Begin (or Watch the tour). */
  start(sj_o: { tour?: boolean } = {}): void {
    this.hud.show();
    this.hud.setSound(!this.audio.muted);
    this.hud.setMusic(this.audio.musicOn);
    if (sj_o.tour) {
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
      openScroll: (sj_section, sj_focus, sj_rise) => {
        this.map.close();
        this.menu.close();
        // (no rise when tests fast-forward the film: it runs on wall-clock time)
        const sj_from = sj_rise && this.app.loop.substeps === 1 ? this.pandaOnScreen() : undefined;
        return this.scroll.open(sj_section, sj_focus, sj_from);
      },
      closeScroll: () => this.scroll.close(),
      scrollBody: () => (this.scroll.isOpen ? this.scroll.bodyEl : null),
      ceremony: (sj_section) => {
        this.progress.discover(sj_section);
        this.celebrate(sj_section);
      },
      strikeDummy: (sj_i) => this.strikeDummy(sj_i),
      beatDrum: () => this.beatDrum(),
      ringBell: (sj_onGong) => this.ringBell(sj_onGong),
      closePanels: () => {
        this.scroll.close();
        this.map.close();
        this.menu.close();
      },
      setTouring: (sj_on) => {
        this.cancelPending();
        this.app.rig.endShot();
        this.hud.setTouring(sj_on);
        this.scroll.setFilm(sj_on);
        if (sj_on) {
          this.scroll.close();
          this.map.close();
          this.menu.close();
          // Whatever button started the film must not keep Space and Enter.
          const sj_active = document.activeElement;
          if (sj_active instanceof HTMLElement) sj_active.blur();
        }
      },
      toast: (sj_text) => this.hud.toast(sj_text, true),
      sound: (sj_name) => this.audio.sfx(sj_name),
      openClassic: () => this.classic.open(),
    };
  }

  /** setTimeout that quick travel and progress reset can cancel. */
  private later(sj_fn: () => void, sj_ms: number): void {
    const sj_id = window.setTimeout(() => {
      this.pending.delete(sj_id);
      sj_fn();
    }, sj_ms);
    this.pending.add(sj_id);
  }

  private cancelPending(): void {
    for (const sj_id of this.pending) window.clearTimeout(sj_id);
    this.pending.clear();
  }

  private get panelOpen(): boolean {
    return this.scroll.isOpen || this.map.isOpen || this.menu.isOpen || this.classic.isOpen;
  }

  private wire(): void {
    const sj_app = this.app;
    const sj_input = sj_app.input;
    const sj_audio = this.audio;

    sj_input.on('action', (sj_a) => {
      if (!sj_app.started) return;
      if (this.tour.running) {
        if (sj_a === 'mute') this.toggleSound();
        else if (!this.classic.isOpen) this.tour.onAction(sj_a);
        return;
      }
      if (sj_a === 'escape') {
        if (this.scroll.isOpen) this.scroll.close();
        else if (this.map.isOpen) this.map.close();
        else if (this.menu.isOpen) this.menu.close();
        else if (this.classic.isOpen) this.classic.close();
        else this.menu.open();
        return;
      }
      if (sj_a === 'map') {
        this.toggleMap();
        return;
      }
      if (sj_a === 'mute') {
        this.toggleSound();
        return;
      }
      if (this.scroll.isOpen) {
        if (sj_a === 'next') this.scroll.step(1);
        if (sj_a === 'prev') this.scroll.step(-1);
        return;
      }
      if (this.panelOpen) return;
      if (sj_a === 'interact') this.zones.interact('E');
      if (sj_a === 'strike') this.onStrike();
      if (sj_a === 'help') this.openSection('welcome');
    });
    sj_input.on('any', () => {
      if (!this.moved && sj_app.started && sj_input.move.lengthSq() > 0.01) {
        this.moved = true;
        window.setTimeout(() => this.hud.fadeHints(), 4000);
      }
    });

    this.zones.on('focus', (sj_it) => {
      this.hud.setPrompt(sj_it ? sj_it.prompt : null, sj_it?.key ?? 'E', sj_input.usingTouch);
      sj_app.animator.lookTarget = sj_it ? { x: sj_it.x, y: sj_it.y + 0.8, z: sj_it.z } : null;
    });
    this.zones.on('trigger', (sj_it) => this.onTrigger(sj_it));
    this.zones.shouldAutoFire = (sj_it) => !!sj_it.section && !this.progress.has(sj_it.section);

    this.hud.on('prompt', () => this.zones.interact('E'));
    this.hud.on('map', () => this.toggleMap());
    this.hud.on('sound', () => this.toggleSound());
    this.hud.on('music', () => {
      sj_audio.setMusic(!sj_audio.musicOn);
      this.hud.setMusic(sj_audio.musicOn);
    });
    this.hud.on('menu', () => {
      this.scroll.close();
      this.map.close();
      this.menu.toggle();
    });
    this.hud.on('seal', (sj_id) => this.openSection(sj_id));

    // "schedushh": the scroll whooshes out and unrolls (after its flight, if it rises)
    this.scroll.on('open', () =>
      sj_audio.sfx('unroll', {
        delay: this.scroll.rising ? ScrollPanel.UNROLL_AT_MS / 1000 : 0.12,
      }),
    );
    this.scroll.on('close', () => {
      sj_audio.sfx('close');
      sj_app.rig.endShot();
      if (!this.tips.beacons && this.progress.count === 1 && this.progress.has('welcome')) {
        this.tips.beacons = true;
        window.setTimeout(
          () => this.hud.toast('Golden beacons mark the scrolls still hidden'),
          800,
        );
      }
    });
    this.scroll.on('switch', () => sj_audio.sfx('ui'));
    this.scroll.on('project', () => sj_audio.sfx('ui'));
    this.scroll.on('travel', (sj_id) => !this.tour.running && this.travelTo(sj_id));
    this.map.on('travel', (sj_id) => this.travelTo(sj_id));
    this.menu.on('quality', (sj_q) => sj_app.quality.set(sj_q));
    sj_app.quality.on('change', (sj_s) => this.menu.setQuality(sj_s.level));
    this.menu.on('classic', () => this.classic.open());
    this.menu.on('tour', () => this.tour.start());
    this.menu.on('help', () => this.openSection('welcome'));
    this.menu.on('reset', () => {
      this.cancelPending(); // including a ceremony in progress: release its camera shot
      sj_app.rig.endShot();
      this.progress.reset();
      this.hud.toast('The scrolls are hidden again');
    });

    // Player sounds.
    const sj_c = sj_app.controller;
    sj_c.on('jump', () => sj_audio.sfx('jump'));
    sj_c.on('land', ({ impact: sj_impact }) =>
      sj_audio.sfx('land', { volume: Math.min(1, sj_impact / 10) }),
    );
    sj_c.on('splash', ({ strength: sj_strength }) =>
      sj_audio.sfx('splash', { volume: sj_strength }),
    );
    sj_c.on('bump', ({ tag: sj_tag }) => {
      if (sj_tag === 'bamboo') sj_audio.sfx('rustle', { volume: 0.5 });
    });
    sj_app.animator.on('step', ({ run: sj_run }) => sj_audio.footstep(sj_c.surface, sj_run));
    sj_app.animator.on('paddle', () => sj_audio.sfx('swim'));
    sj_app.animator.on('strikeWhoosh', () => sj_audio.sfx('whoosh'));
    sj_app.animator.on('meditateStart', () => sj_audio.sfx('chime'));
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
    const sj_app = this.app;
    if (sj_app.controller.swimming) return;
    if (!sj_app.animator.play('strike')) return;
    const sj_it = this.zones.active;
    if (sj_it && (sj_it.kind === 'dummy' || sj_it.kind === 'drum' || sj_it.kind === 'bell')) {
      window.setTimeout(() => this.onTrigger(sj_it, true), 0);
    }
  }

  private onTrigger(sj_it: Interactable, sj_fromStrike = false): void {
    const sj_now = performance.now();
    if (sj_now < this.busyUntil) return;
    const sj_app = this.app;
    switch (sj_it.kind) {
      case 'gate':
      case 'scroll':
      case 'banner':
      case 'milestone':
        this.discoverOrOpen(sj_it.section!, sj_it.focus, sj_it);
        break;
      case 'dummy': {
        if (!sj_fromStrike && !sj_app.animator.play('strike')) return;
        const sj_index = sj_it.focus ?? 0;
        if (sj_now - this.lastStrikeHit < 450) return;
        this.lastStrikeHit = sj_now;
        this.later(() => {
          const sj_p = sj_app.controller.position;
          sj_app.architecture.training.hit(sj_index, sj_p.x, sj_p.z, 1);
          this.audio.sfx('thwack', { x: sj_it.x, z: sj_it.z });
          sj_app.dustRing(sj_tmp.set(sj_it.x, sj_it.y + 0.2, sj_it.z), 0.5);
          if (!this.progress.has('skills')) {
            this.later(() => {
              if (this.panelOpen) this.discoverQuietly('skills');
              else this.discoverOrOpen('skills', sj_index, sj_it);
            }, 350);
          } else {
            const sj_g = sj_app.content.skills.groups[sj_index];
            if (sj_g)
              this.hud.toast(`${sj_g.name}: ${sj_g.items.map((sj_x) => sj_x.name).join(' · ')}`);
          }
        }, 330);
        break;
      }
      case 'drum': {
        if (!sj_fromStrike) sj_app.animator.play('strike');
        // land the sound on the kick's impact frame
        this.later(() => {
          this.audio.sfx('drum', { x: sj_it.x, z: sj_it.z });
          sj_app.dustRing(sj_tmp.set(sj_it.x, sj_it.y - 1, sj_it.z), 0.9);
          sj_globalUniforms.uShockwave.value.set(sj_it.x, sj_it.y - 1, sj_it.z);
          sj_globalUniforms.uShockAge.value = 0;
        }, 330);
        break;
      }
      case 'bell': {
        const sj_rang = this.ringBell(() => {
          this.later(() => {
            if (this.panelOpen) this.discoverQuietly('contact');
            else this.discoverOrOpen('contact', undefined, sj_it);
          }, 1300);
        });
        if (sj_rang) this.busyUntil = sj_now + 900;
        break;
      }
    }
  }

  /** Swings the striker into the bell: gong, sky lanterns, a shudder. */
  private ringBell(sj_onGong?: () => void): boolean {
    const sj_app = this.app;
    const sj_bell = this.zones.find('bell')!;
    return sj_app.architecture.ringBell(() => {
      this.audio.sfx('gong', { x: sj_bell.x, z: sj_bell.z });
      this.lanterns.release({ x: sj_bell.x, y: sj_bell.y + 1, z: sj_bell.z }, 14);
      sj_app.rig.shake(0.35);
      sj_onGong?.();
    });
  }

  /** A spin-kick that lands on training dummy `sj_index` (the tour's strikes). */
  private strikeDummy(sj_index: number): void {
    const sj_app = this.app;
    const sj_d = sj_app.architecture.training.dummies[sj_index];
    if (!sj_d || !sj_app.animator.play('strike')) return;
    const sj_off = sj_app.animator.on('strikeImpact', () => {
      sj_off();
      const sj_p = sj_app.controller.position;
      sj_app.architecture.training.hit(sj_index, sj_p.x, sj_p.z, 1);
      this.audio.sfx('thwack', { x: sj_d.x, z: sj_d.z });
      sj_app.dustRing(sj_tmp.set(sj_d.x, sj_d.y + 0.2, sj_d.z), 0.5);
    });
  }

  /** A kick on the big drum: boom and a shock-wave through the grass. */
  private beatDrum(): void {
    const sj_app = this.app;
    const sj_drum = sj_app.architecture.anchors.drum;
    if (!sj_app.animator.play('strike')) return;
    const sj_off = sj_app.animator.on('strikeImpact', () => {
      sj_off();
      this.audio.sfx('drum', { x: sj_drum.x, z: sj_drum.z });
      sj_app.dustRing(sj_tmp.set(sj_drum.x, sj_drum.y - 1, sj_drum.z), 0.9);
      sj_globalUniforms.uShockwave.value.set(sj_drum.x, sj_drum.y - 1, sj_drum.z);
      sj_globalUniforms.uShockAge.value = 0;
    });
  }

  /** The discovery moment itself: bow, light, golden ink, seal, bloom. */
  private celebrate(sj_section: SectionId): void {
    const sj_app = this.app;
    sj_app.controller.velocity.set(0, 0, 0);
    sj_app.animator.play('bow');
    this.discovery.play(sj_app.controller.position, 1);
    this.audio.sfx('discover');
    this.hud.stamp(sj_section);
    sj_app.renderer.pulseBloom(1.2);
  }

  /** First visit: the discovery ceremony. Later: straight to the scroll. */
  private discoverOrOpen(
    sj_section: SectionId,
    sj_focus: number | undefined,
    sj_at?: Interactable,
  ): void {
    const sj_app = this.app;
    if (this.progress.discover(sj_section)) {
      this.busyUntil = performance.now() + 2700;
      this.celebrate(sj_section);
      this.frameShot(sj_at, 1.6);
      // The scroll waits for the bow and the golden light, then rises out of the panda.
      this.later(() => {
        // If the visitor opened the map or menu meanwhile, the scroll waits in the tabs
        // and the camera goes back to following the panda.
        if (this.panelOpen) sj_app.rig.endShot();
        else this.scroll.open(sj_section, sj_focus, this.pandaOnScreen());
        this.announce(sj_section);
      }, sj_CEREMONY_MS);
    } else {
      this.frameShot(sj_at, 1.1);
      this.scroll.open(sj_section, sj_focus);
    }
  }

  /** Where the panda's chest is on screen (CSS pixels), or undefined if out of view. */
  private pandaOnScreen(): { x: number; y: number } | undefined {
    const sj_c = this.app.controller.position;
    const sj_v = sj_tmp.set(sj_c.x, sj_c.y + 1.0, sj_c.z).project(this.app.rig.camera);
    if (sj_v.z > 1 || Math.abs(sj_v.x) > 1.2 || Math.abs(sj_v.y) > 1.2) return undefined;
    return {
      x: ((sj_v.x + 1) / 2) * window.innerWidth,
      y: ((1 - sj_v.y) / 2) * window.innerHeight,
    };
  }

  /** A delayed discovery that lands while a panel is open: record it without the show. */
  private discoverQuietly(sj_section: SectionId): void {
    if (!this.progress.discover(sj_section)) return;
    this.audio.sfx('discover');
    this.announce(sj_section);
  }

  private announce(sj_section: SectionId): void {
    const { count: sj_count, total: sj_total } = this.progress;
    this.hud.toast(`New scroll: ${sectionMeta(sj_section).label} (${sj_count}/${sj_total})`);
    if (sj_count === sj_total) {
      this.later(() => this.hud.toast('Every scroll found. Thank you for visiting!'), 1600);
    }
  }

  /** Eases the camera into a three-quarter view of the panda and the landmark. */
  private frameShot(sj_at: Interactable | undefined, sj_duration: number): void {
    const sj_app = this.app;
    const sj_p = sj_app.controller.position;
    const sj_spot = sj_at ?? { x: sj_p.x, y: sj_p.y, z: sj_p.z + 1 };
    const sj_dx = sj_p.x - sj_spot.x;
    const sj_dz = sj_p.z - sj_spot.z;
    const sj_len = Math.hypot(sj_dx, sj_dz) || 1;
    const sj_ang = Math.atan2(sj_dx / sj_len, sj_dz / sj_len) + 0.75;
    const sj_target = new Vector3(
      (sj_p.x + sj_spot.x) / 2,
      Math.max(sj_p.y, sj_spot.y) + 1.1,
      (sj_p.z + sj_spot.z) / 2,
    );
    const sj_position = new Vector3(
      sj_p.x + Math.sin(sj_ang) * 6.5,
      sj_p.y + 3.2,
      sj_p.z + Math.cos(sj_ang) * 6.5,
    );
    const sj_ground = sj_app.terrain.heightAt(sj_position.x, sj_position.z) + 1;
    sj_position.y = Math.max(sj_position.y, sj_ground);
    sj_app.rig.playShot({ position: sj_position, target: sj_target }, sj_duration);
  }

  openSection(sj_id: SectionId): void {
    this.map.close();
    this.menu.close();
    this.scroll.open(sj_id);
  }

  /** Quick travel with a puff of cloud. */
  travelTo(sj_id: SectionId): void {
    const sj_app = this.app;
    const sj_dest = sj_TRAVEL_POINTS[sj_id];
    this.cancelPending();
    this.scroll.close();
    this.map.close();
    this.audio.sfx('travel');
    this.puff(sj_app.controller.position);
    sj_app.controller.teleport(sj_dest.x, sj_dest.z, sj_dest.yaw);
    sj_app.scarf.snap();
    sj_app.rig.startFollow(sj_app.controller.position, sj_dest.yaw, 0.01);
    window.setTimeout(() => this.puff(sj_app.controller.position), 60);
  }

  private puff(sj_at: Vector3): void {
    for (let sj_i = 0; sj_i < 26; sj_i++) {
      const sj_a = (sj_i / 26) * Math.PI * 2;
      this.app.particles.spawn({
        x: sj_at.x + Math.cos(sj_a) * 0.5,
        y: sj_at.y + 0.3 + Math.random() * 1.2,
        z: sj_at.z + Math.sin(sj_a) * 0.5,
        vx: Math.cos(sj_a) * 2.2,
        vy: 0.6 + Math.random(),
        vz: Math.sin(sj_a) * 2.2,
        life: 0.9 + Math.random() * 0.5,
        size: 0.7,
        sizeEnd: 1.6,
        color: sj_CLOUD,
        alpha: 0.8,
        drag: 0.08,
        sprite: sj_SPRITE.puff,
      });
    }
  }

  update(sj_dt: number, sj_time: number): void {
    const sj_app = this.app;
    const sj_touring = this.tour.running;
    this.tour.update(sj_dt);
    if (sj_app.started && !this.panelOpen && !sj_touring) this.playTime += sj_dt;
    if (!this.tips.map && this.playTime > 75 && this.progress.count < 3) {
      this.tips.map = true;
      this.hud.toast(
        sj_app.input.usingTouch
          ? 'Tip: the map button shows every landmark'
          : 'Tip: press M for the map and quick travel',
      );
    }
    sj_app.uiBlocking = this.panelOpen;
    sj_app.renderPaused = this.classic.isOpen;
    this.touch.setEnabled(!this.panelOpen && sj_app.started && !sj_touring);
    const sj_p = sj_app.controller.position;
    this.zones.update(
      sj_p,
      sj_app.started && !this.panelOpen && !sj_touring && performance.now() > this.busyUntil,
    );
    this.beacons.update(sj_time, sj_p, sj_touring);
    this.discovery.update(sj_dt);
    this.lanterns.update(sj_dt, sj_globalUniforms.uWindDir.value);
    this.map.update(sj_p.x, sj_p.z, sj_app.controller.yaw);
    this.audio.update(sj_dt, {
      camera: sj_app.rig.camera,
      player: sj_p,
      swimming: sj_app.controller.swimming,
      meditating: sj_app.animator.meditating,
      panelOpen: this.panelOpen,
      waterfall: sj_app.water.waterfall.bottom,
    });
  }
}
