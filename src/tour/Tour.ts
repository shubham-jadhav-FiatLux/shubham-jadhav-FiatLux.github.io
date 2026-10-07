import { Vector3 } from 'three';
import { Emitter } from '../core/Emitter';
import type { Action } from '../core/Input';
import type { App } from '../app/App';
import type { PandaAnimator } from '../player/PandaAnimator';
import type { SectionId } from '../content/sections';
import type { PortfolioContent } from '../content/types';
import type { Anchors } from '../world/architecture/Architecture';
import { TourOverlay, type Callout } from '../ui/TourOverlay';
import { ScrollPanel } from '../ui/ScrollPanel';
import { sj_CEREMONY_MS } from '../effects/Discovery';
import { Autopilot } from './Autopilot';
import { Director } from './Director';
import { Route, type XZ } from './route';
import type { Shot, Subject } from './shots';
import { Cancelled, readingTime, Ticket, Timeline } from './timeline';
import { sj_CHAPTERS, chapterCard, sj_SECTION_CHAPTERS } from './script';

/** What the tour needs from the gameplay layer. */
export interface TourHost {
  scrollOpen(): boolean;
  /** `sj_rise`: the scroll rises out of the panda before it unrolls; returns true if it does */
  openScroll(sj_section: SectionId, sj_focus?: number, sj_rise?: boolean): boolean;
  closeScroll(): void;
  /** the scrollable text of the open scroll */
  scrollBody(): HTMLElement | null;
  /** the discovery moment for `sj_section`, whether or not it was found before */
  ceremony(sj_section: SectionId): void;
  strikeDummy(sj_index: number): void;
  beatDrum(): void;
  /** swings the striker; `sj_onGong` fires on impact. False if it is still swinging. */
  ringBell(sj_onGong: () => void): boolean;
  closePanels(): void;
  setTouring(sj_on: boolean): void;
  toast(sj_text: string): void;
  sound(sj_name: 'chime' | 'whoosh'): void;
  openClassic(): void;
}

/** Everything a chapter script can do. Every await throws `Cancelled` when skipped. */
export interface TourContext {
  readonly app: App;
  readonly content: PortfolioContent;
  readonly anchors: Anchors;
  /** the panda, for shots that follow it */
  readonly subject: () => Subject;
  /** a point that follows the panda (feet) */
  readonly panda: () => Vector3;
  /** true once the panda has reached the end of its walk */
  arrived(): boolean;
  wait(sj_seconds: number): Promise<void>;
  until(sj_done: () => boolean, sj_timeout?: number): Promise<void>;
  /**
   * Walks (or runs) through the points, from wherever the panda stands; `pace` is a
   * fraction of full speed (0.6: a stroll).
   */
  walk(sj_points: XZ[], sj_o?: Gait): Promise<void>;
  /** like `walk`, but returns at once */
  go(sj_points: XZ[], sj_o?: Gait): void;
  face(sj_x: number, sj_z: number): void;
  /** a jump (walking or standing) */
  jump(): void;
  /** where the panda's head looks: a point, into the lens, or (`null`) wherever it likes */
  look(sj_p: { x: number; y: number; z: number } | 'camera' | null): void;
  /** puts the panda somewhere (hidden by a cut or a fade) */
  place(sj_x: number, sj_z: number, sj_yaw: number): void;
  /** a wave, a bow... */
  emote(sj_action: Parameters<PandaAnimator['play']>[0]): void;
  /** cuts (or blends over `sj_blend` s, bowing up by `arc` × the distance) to a shot */
  cut(sj_shot: Shot, sj_blend?: number, sj_o?: { arc?: number }): void;
  /** true while the picture is faded to black (it stays black across a skip) */
  readonly dark: boolean;
  fadeOut(sj_seconds?: number): Promise<void>;
  fadeIn(sj_seconds?: number): Promise<void>;
  /** chapter title card (hides itself after a few seconds of tour time) */
  card(sj_section: SectionId): void;
  title(sj_on: boolean): void;
  /** a line of narration (hides itself after `sj_seconds` of tour time) */
  caption(sj_text: string | null, sj_seconds?: number): void;
  /** the discovery: bow, golden light, seal; returns once the light has faded */
  ceremony(sj_section: SectionId): Promise<void>;
  /** the scroll rises out of the panda and stays open long enough to read */
  read(sj_section: SectionId, sj_focus?: number): Promise<void>;
  /** a note that pops up over the picture for `sj_seconds` (`null` hides it) */
  callout(sj_c: Callout | null, sj_seconds?: number): void;
  /** stages the valley's life for a shot */
  stage: {
    butterflies(sj_x: number, sj_z: number, sj_count: number, sj_radius?: number): void;
    koi(sj_x: number, sj_z: number, sj_count: number, sj_heading?: number): void;
    leap(sj_x: number, sj_z: number): void;
  };
  strike(sj_dummy: number): Promise<void>;
  drum(): Promise<void>;
  bell(): Promise<void>;
  meditate(sj_on: boolean): void;
}

export type TourEnd = 'finished' | 'exit' | 'takeover';

export interface Gait {
  run?: boolean;
  pace?: number;
}

const sj_tmp = new Vector3();

/**
 * "Watch the tour": the panda walks the valley on its own, chapter by chapter, while a
 * director films it: title cards, captions, cuts and camera moves, every discovery, every
 * scroll (held long enough to read), the dummies, the bridge, the banners and the bell.
 * Visitors can pause, skip, jump to a chapter or take the controls at any moment.
 */
export class Tour extends Emitter<{ start: void; end: TourEnd }> {
  running = false;
  readonly timeline = new Timeline();
  readonly autopilot: Autopilot;
  readonly director: Director;
  readonly overlay: TourOverlay;
  private ticket = new Ticket();
  /** index into CHAPTERS of the chapter playing */
  private index = -1;
  private jumpTo: number | null = null;
  private runId = 0;
  private ended = false;
  private reading: { start: number; duration: number } | null = null;
  private continueReading = false;
  private takeover = 0;
  /** the picture is faded to black */
  private dark = false;
  /** the panda looks into the lens */
  private eyeContact = false;
  private readonly lensPoint = { x: 0, y: 0, z: 0 };
  private readonly subjectPose: Subject = { position: new Vector3(), yaw: 0 };

  constructor(
    private readonly app: App,
    private readonly host: TourHost,
    sj_root: HTMLElement,
  ) {
    super();
    this.autopilot = new Autopilot(app.controller);
    this.director = new Director(app.rig, (sj_x, sj_z) => app.terrain.heightAt(sj_x, sj_z));
    this.director.reducedMotion = app.rig.reducedMotion;
    this.overlay = new TourOverlay(sj_root, app.content.site);
    const sj_o = this.overlay;
    sj_o.on('pause', () => this.togglePause());
    sj_o.on('next', () => this.next());
    sj_o.on('exit', () => this.exit(this.ended ? 'finished' : 'exit'));
    sj_o.on('chapter', (sj_i) => this.goto(sj_SECTION_CHAPTERS[sj_i] ?? 0));
    sj_o.on('continue', () => this.finishReading());
    sj_o.on('again', () => this.restart());
    sj_o.on('explore', () => this.exit('finished'));
    sj_o.on('classic', () => {
      this.exit('finished');
      host.openClassic();
    });
    app.beforeCamera.push((sj_dt) => {
      if (!this.running) return;
      this.director.update(sj_dt);
      if (this.eyeContact) {
        const sj_cam = app.rig.camera.position;
        this.lensPoint.x = sj_cam.x;
        this.lensPoint.y = sj_cam.y;
        this.lensPoint.z = sj_cam.z;
        app.animator.lookTarget = this.lensPoint;
      }
    });
  }

  get paused(): boolean {
    return this.timeline.paused;
  }

  /** Index of the chapter playing (into the full chapter list), -1 when not running. */
  get chapter(): number {
    return this.running ? this.index : -1;
  }

  start(sj_from = 0): void {
    if (this.running) {
      this.goto(sj_from);
      return;
    }
    this.running = true;
    this.host.closePanels();
    this.host.setTouring(true);
    this.app.driver = this.autopilot;
    this.overlay.show(sj_SECTION_CHAPTERS.map((sj_i) => sj_CHAPTERS[sj_i]!.strip!));
    this.setPaused(false);
    this.emit('start', undefined);
    void this.run(sj_from);
  }

  /** Leaves the tour; the visitor walks on from wherever the panda stands. */
  exit(sj_reason: TourEnd = 'exit'): void {
    if (!this.running) return;
    this.running = false;
    this.runId++;
    this.ticket.cancel();
    this.timeline.clear();
    this.cleanup();
    this.ended = false;
    this.overlay.setEnd(null);
    this.overlay.hide();
    this.dark = false;
    this.director.release();
    this.app.wildlife.release();
    this.autopilot.stop();
    this.app.driver = null;
    const sj_c = this.app.controller;
    this.app.rig.startFollow(sj_c.position, sj_c.yaw, this.app.rig.reducedMotion ? 0.01 : 1.6);
    this.host.setTouring(false);
    this.setPaused(false);
    if (sj_reason !== 'finished') this.host.toast('You have the controls: explore freely');
    this.emit('end', sj_reason);
  }

  /** Skips to the next chapter (or past the scroll being read). */
  next(): void {
    if (!this.running) return;
    if (this.reading) {
      this.finishReading();
      return;
    }
    if (this.ended) return;
    this.goto(this.index + 1);
  }

  /** Jumps to a chapter (index into the full list; past the last one: the closing card). */
  goto(sj_index: number): void {
    if (!this.running) return;
    const sj_target = Math.max(0, Math.min(sj_CHAPTERS.length, sj_index));
    if (this.ended) {
      this.ended = false;
      this.overlay.setEnd(null);
      void this.run(sj_target);
      return;
    }
    this.jumpTo = sj_target;
    this.ticket.cancel();
  }

  restart(): void {
    this.goto(0);
  }

  togglePause(): void {
    if (!this.running || this.ended) return;
    this.setPaused(!this.paused);
  }

  private setPaused(sj_p: boolean): void {
    this.timeline.paused = sj_p;
    this.autopilot.paused = sj_p;
    this.director.paused = sj_p;
    this.overlay.setPaused(sj_p);
  }

  /** Keyboard and gamepad while the tour runs. */
  onAction(sj_a: Action): void {
    if (sj_a === 'escape') {
      if (this.host.scrollOpen()) this.finishReading();
      else this.exit(this.ended ? 'finished' : 'exit');
    } else if (sj_a === 'jump') this.togglePause();
    else if (sj_a === 'interact') {
      if (this.ended) this.exit('finished');
      else this.next();
    } else if (sj_a === 'next') this.next();
    else if (sj_a === 'prev') this.goto(Math.max(0, this.index - 1));
  }

  private finishReading(): void {
    this.continueReading = true;
  }

  update(sj_dt: number): void {
    if (!this.running) return;
    // Moving the panda by hand takes over from the tour (checked before the script runs
    // on, so nothing it does this frame happens after the visitor took the controls).
    const sj_m = this.app.input.move;
    if (sj_m.lengthSq() > 0.25 && !this.host.scrollOpen() && !this.ended) {
      this.takeover += sj_dt;
      if (this.takeover > 0.12) {
        this.exit('takeover');
        return;
      }
    } else this.takeover = 0;
    this.timeline.update(sj_dt);
    if (this.reading) {
      const sj_f = (this.timeline.now - this.reading.start) / this.reading.duration;
      this.overlay.setReading(true, sj_f);
      // Let the text scroll by gently for longer scrolls.
      const sj_body = this.host.scrollBody();
      if (sj_body && !this.paused) {
        const sj_room = sj_body.scrollHeight - sj_body.clientHeight;
        if (sj_room > 8) {
          const sj_k = Math.min(1, Math.max(0, (sj_f - 0.3) / 0.6));
          const sj_eased = sj_k * sj_k * (3 - 2 * sj_k);
          sj_body.scrollTop = Math.max(sj_body.scrollTop, sj_eased * sj_room);
        }
      }
    }
  }

  private async run(sj_from: number): Promise<void> {
    const sj_id = ++this.runId;
    let sj_i = sj_from;
    while (this.running && sj_id === this.runId && sj_i < sj_CHAPTERS.length) {
      this.index = sj_i;
      this.jumpTo = null;
      this.ticket = new Ticket();
      const sj_chapter = sj_CHAPTERS[sj_i]!;
      this.overlay.setChapter(
        sj_chapter.section ? sj_SECTION_CHAPTERS.indexOf(sj_i) : sj_i === 0 ? -1 : 99,
      );
      try {
        await sj_chapter.run(this.context(this.ticket));
      } catch (sj_e) {
        if (!(sj_e instanceof Cancelled)) console.error(sj_e);
      }
      if (!this.running || sj_id !== this.runId) return;
      this.cleanup();
      sj_i = this.jumpTo ?? sj_i + 1;
    }
    if (this.running && sj_id === this.runId) {
      this.ended = true;
      this.autopilot.stop();
      this.overlay.setEnd({
        owner: this.app.content.owner.name.includes('[') ? '' : this.app.content.owner.name,
      });
    }
  }

  /** Leaves the world tidy after a chapter ends or is skipped. */
  private cleanup(): void {
    this.reading = null;
    this.continueReading = false;
    this.overlay.setReading(false);
    this.overlay.setCard(null);
    this.overlay.setTitle(null);
    this.overlay.setCaption(null);
    this.overlay.setCallout(null);
    if (this.host.scrollOpen()) this.host.closeScroll();
    this.autopilot.stop();
    this.eyeContact = false;
    this.app.animator.lookTarget = null;
    this.autopilot.idleSeconds = 0;
  }

  private context(sj_ticket: Ticket): TourContext {
    const sj_app = this.app;
    const sj_tl = this.timeline;
    const sj_host = this.host;
    const sj_overlay = this.overlay;
    const sj_autopilot = this.autopilot;
    const sj_c = sj_app.controller;
    /** Every step first makes sure its chapter is still playing. */
    const sj_live = () => sj_ticket.check();
    const sj_wait = (sj_s: number) => sj_tl.wait(sj_s, sj_ticket);
    const sj_until = (sj_done: () => boolean, sj_timeout?: number) =>
      sj_tl.until(sj_done, sj_ticket, sj_timeout);
    /** Runs `sj_fn` after `sj_seconds` of tour time, unless the chapter ends first. */
    const sj_later = (sj_seconds: number, sj_fn: () => void) => {
      sj_tl.wait(sj_seconds, sj_ticket).then(sj_fn, () => undefined);
    };
    let sj_cardId = 0;
    let sj_captionId = 0;
    let sj_calloutId = 0;
    const sj_go = (sj_points: XZ[], sj_o: Gait = {}) => {
      sj_live();
      const sj_route = new Route([[sj_c.position.x, sj_c.position.z], ...sj_points]);
      sj_autopilot.walk(sj_route, sj_o.run ?? false, sj_o.pace ?? 1);
      return sj_route;
    };
    const sj_fade = async (sj_on: boolean, sj_seconds: number, sj_hold: number) => {
      sj_live();
      this.dark = sj_on;
      sj_overlay.fade(sj_on, sj_seconds);
      await sj_wait(sj_hold);
    };
    const sj_isDark = () => this.dark;
    return {
      app: sj_app,
      content: sj_app.content,
      anchors: sj_app.architecture.anchors,
      subject: () => {
        this.subjectPose.position.copy(sj_c.position);
        this.subjectPose.yaw = sj_c.yaw;
        return this.subjectPose;
      },
      panda: () => sj_tmp.copy(sj_c.position),
      arrived: () => sj_autopilot.done,
      wait: sj_wait,
      until: sj_until,
      go: (sj_points, sj_o) => void sj_go(sj_points, sj_o),
      walk: async (sj_points, sj_o = {}) => {
        const sj_route = sj_go(sj_points, sj_o);
        const sj_speed = (sj_o.run ? 7 : 3.3) * Math.min(1, Math.max(0.3, sj_o.pace ?? 1)) * 0.75;
        await sj_until(() => sj_autopilot.done, sj_route.length / sj_speed + 4);
        if (!sj_autopilot.done) {
          // Held up somewhere: finish the move off-camera rather than stall the film.
          const [sj_x, sj_z] = sj_route.end;
          sj_c.teleport(sj_x, sj_z, sj_c.yaw);
          sj_autopilot.stop();
        }
      },
      face: (sj_x, sj_z) => {
        sj_live();
        sj_autopilot.face(sj_x, sj_z);
      },
      jump: () => {
        sj_live();
        sj_autopilot.hop();
      },
      look: (sj_p) => {
        sj_live();
        this.eyeContact = sj_p === 'camera';
        sj_app.animator.lookTarget = sj_p === 'camera' ? this.lensPoint : sj_p;
      },
      place: (sj_x, sj_z, sj_yaw) => {
        sj_live();
        sj_autopilot.stop();
        sj_c.teleport(sj_x, sj_z, sj_yaw);
        sj_app.scarf.snap();
        sj_app.panda.root.position.copy(sj_c.position);
      },
      emote: (sj_action) => {
        sj_live();
        sj_app.animator.play(sj_action);
      },
      cut: (sj_shot, sj_blend = 0, sj_o) => {
        sj_live();
        this.director.cut(sj_shot, sj_blend, sj_o);
      },
      get dark() {
        return sj_isDark();
      },
      fadeOut: (sj_s = 0.7) => sj_fade(true, sj_s, sj_s),
      fadeIn: (sj_s = 0.9) => sj_fade(false, sj_s, sj_s * 0.3),
      card: (sj_section) => {
        sj_live();
        sj_overlay.setCard(chapterCard(sj_section, sj_app.content));
        sj_host.sound('chime');
        const sj_id = ++sj_cardId;
        sj_later(3.6, () => sj_id === sj_cardId && sj_overlay.setCard(null));
      },
      title: (sj_on) => {
        sj_live();
        sj_overlay.setTitle(
          sj_on
            ? {
                title: sj_app.content.site.title,
                owner: sj_app.content.owner.name.includes('[')
                  ? undefined
                  : `${sj_app.content.owner.name} · ${sj_app.content.owner.role}`,
                tagline: sj_app.content.site.tagline,
              }
            : null,
        );
      },
      caption: (sj_text, sj_seconds = 4.8) => {
        sj_live();
        sj_overlay.setCaption(sj_text);
        const sj_id = ++sj_captionId;
        if (sj_text)
          sj_later(sj_seconds, () => sj_id === sj_captionId && sj_overlay.setCaption(null));
      },
      ceremony: async (sj_section) => {
        sj_live();
        sj_host.ceremony(sj_section);
        await sj_wait(sj_CEREMONY_MS / 1000);
      },
      read: async (sj_section, sj_focus) => {
        sj_live();
        // never read in the dark
        if (this.dark) await sj_fade(false, 0.5, 0.3);
        const sj_rose = sj_host.openScroll(sj_section, sj_focus, true);
        const sj_body = sj_host.scrollBody();
        const sj_words = sj_body?.textContent?.split(/\s+/).filter(Boolean).length ?? 40;
        // time to read, plus the scroll's rise and unrolling
        const sj_duration = readingTime(sj_words) + (sj_rose ? ScrollPanel.RISE_MS / 1000 : 0);
        this.continueReading = false;
        this.reading = { start: sj_tl.now, duration: sj_duration };
        sj_overlay.setReading(true, 0);
        try {
          await sj_until(
            () =>
              this.continueReading ||
              !sj_host.scrollOpen() ||
              sj_tl.now - this.reading!.start >= sj_duration,
          );
        } finally {
          this.reading = null;
          this.continueReading = false;
          sj_overlay.setReading(false);
        }
        if (sj_host.scrollOpen()) sj_host.closeScroll();
        await sj_wait(0.5);
      },
      callout: (sj_c, sj_seconds = 3.2) => {
        sj_live();
        sj_overlay.setCallout(sj_c);
        const sj_id = ++sj_calloutId;
        if (sj_c) sj_later(sj_seconds, () => sj_id === sj_calloutId && sj_overlay.setCallout(null));
      },
      stage: {
        butterflies: (sj_x, sj_z, sj_count, sj_radius) => {
          sj_live();
          sj_app.wildlife.gather(sj_x, sj_z, sj_count, sj_radius);
        },
        koi: (sj_x, sj_z, sj_count, sj_heading) => {
          sj_live();
          sj_app.water.koi.gather(sj_x, sj_z, sj_count, sj_heading);
        },
        leap: (sj_x, sj_z) => {
          sj_live();
          sj_app.water.koi.leap(sj_x, sj_z);
        },
      },
      strike: async (sj_dummy) => {
        sj_live();
        sj_host.strikeDummy(sj_dummy);
        await sj_wait(0.8);
      },
      drum: async () => {
        sj_live();
        sj_host.beatDrum();
        await sj_wait(0.9);
      },
      bell: async () => {
        sj_live();
        let sj_rung = false;
        if (!sj_host.ringBell(() => (sj_rung = true))) sj_rung = true;
        await sj_until(() => sj_rung, 4);
      },
      meditate: (sj_on) => {
        sj_live();
        sj_autopilot.idleSeconds = sj_on ? 30 : 0;
      },
    };
  }
}
