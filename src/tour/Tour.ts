import { Vector3 } from 'three';
import { Emitter } from '../core/Emitter';
import type { Action } from '../core/Input';
import type { App } from '../app/App';
import type { PandaAnimator } from '../player/PandaAnimator';
import type { SectionId } from '../content/sections';
import type { PortfolioContent } from '../content/types';
import type { Anchors } from '../world/architecture/Architecture';
import { TourOverlay } from '../ui/TourOverlay';
import { ScrollPanel } from '../ui/ScrollPanel';
import { CEREMONY_MS } from '../effects/Discovery';
import { Autopilot } from './Autopilot';
import { Director } from './Director';
import { Route, type XZ } from './route';
import type { Shot, Subject } from './shots';
import { Cancelled, readingTime, Ticket, Timeline } from './timeline';
import { CHAPTERS, chapterCard, SECTION_CHAPTERS } from './script';

/** What the tour needs from the gameplay layer. */
export interface TourHost {
  scrollOpen(): boolean;
  /** `rise`: the scroll rises out of the panda before it unrolls; returns true if it does */
  openScroll(section: SectionId, focus?: number, rise?: boolean): boolean;
  closeScroll(): void;
  /** the scrollable text of the open scroll */
  scrollBody(): HTMLElement | null;
  /** the discovery moment for `section`, whether or not it was found before */
  ceremony(section: SectionId): void;
  strikeDummy(index: number): void;
  beatDrum(): void;
  /** swings the striker; `onGong` fires on impact. False if it is still swinging. */
  ringBell(onGong: () => void): boolean;
  closePanels(): void;
  setTouring(on: boolean): void;
  toast(text: string): void;
  sound(name: 'chime' | 'whoosh'): void;
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
  wait(seconds: number): Promise<void>;
  until(done: () => boolean, timeout?: number): Promise<void>;
  /** walks (or runs) through the points, from wherever the panda stands */
  walk(points: XZ[], o?: { run?: boolean }): Promise<void>;
  /** like `walk`, but returns at once */
  go(points: XZ[], o?: { run?: boolean }): void;
  face(x: number, z: number): void;
  /** where the panda's head looks (`null`: wherever it likes) */
  look(p: { x: number; y: number; z: number } | null): void;
  /** puts the panda somewhere (hidden by a cut or a fade) */
  place(x: number, z: number, yaw: number): void;
  /** a wave, a bow... */
  emote(action: Parameters<PandaAnimator['play']>[0]): void;
  cut(shot: Shot, blend?: number): void;
  /** true while the picture is faded to black (it stays black across a skip) */
  readonly dark: boolean;
  fadeOut(seconds?: number): Promise<void>;
  fadeIn(seconds?: number): Promise<void>;
  /** chapter title card (hides itself after a few seconds of tour time) */
  card(section: SectionId): void;
  title(on: boolean): void;
  /** a line of narration (hides itself after `seconds` of tour time) */
  caption(text: string | null, seconds?: number): void;
  /** the discovery: bow, golden light, seal; returns once the light has faded */
  ceremony(section: SectionId): Promise<void>;
  /** the scroll rises out of the panda and stays open long enough to read */
  read(section: SectionId, focus?: number): Promise<void>;
  strike(dummy: number): Promise<void>;
  drum(): Promise<void>;
  bell(): Promise<void>;
  meditate(on: boolean): void;
}

export type TourEnd = 'finished' | 'exit' | 'takeover';

const tmp = new Vector3();

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
  private readonly subjectPose: Subject = { position: new Vector3(), yaw: 0 };

  constructor(
    private readonly app: App,
    private readonly host: TourHost,
    root: HTMLElement,
  ) {
    super();
    this.autopilot = new Autopilot(app.controller);
    this.director = new Director(app.rig, (x, z) => app.terrain.heightAt(x, z));
    this.director.reducedMotion = app.rig.reducedMotion;
    this.overlay = new TourOverlay(root, app.content.site.title);
    const o = this.overlay;
    o.on('pause', () => this.togglePause());
    o.on('next', () => this.next());
    o.on('exit', () => this.exit(this.ended ? 'finished' : 'exit'));
    o.on('chapter', (i) => this.goto(SECTION_CHAPTERS[i] ?? 0));
    o.on('continue', () => this.finishReading());
    o.on('again', () => this.restart());
    o.on('explore', () => this.exit('finished'));
    o.on('classic', () => {
      this.exit('finished');
      host.openClassic();
    });
    app.beforeCamera.push((dt) => {
      if (this.running) this.director.update(dt);
    });
  }

  get paused(): boolean {
    return this.timeline.paused;
  }

  /** Index of the chapter playing (into the full chapter list), -1 when not running. */
  get chapter(): number {
    return this.running ? this.index : -1;
  }

  start(from = 0): void {
    if (this.running) {
      this.goto(from);
      return;
    }
    this.running = true;
    this.host.closePanels();
    this.host.setTouring(true);
    this.app.driver = this.autopilot;
    this.overlay.show(SECTION_CHAPTERS.map((i) => CHAPTERS[i]!.strip!));
    this.setPaused(false);
    this.emit('start', undefined);
    void this.run(from);
  }

  /** Leaves the tour; the visitor walks on from wherever the panda stands. */
  exit(reason: TourEnd = 'exit'): void {
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
    this.autopilot.stop();
    this.app.driver = null;
    const c = this.app.controller;
    this.app.rig.startFollow(c.position, c.yaw, this.app.rig.reducedMotion ? 0.01 : 1.6);
    this.host.setTouring(false);
    this.setPaused(false);
    if (reason !== 'finished') this.host.toast('You have the controls: explore freely');
    this.emit('end', reason);
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
  goto(index: number): void {
    if (!this.running) return;
    const target = Math.max(0, Math.min(CHAPTERS.length, index));
    if (this.ended) {
      this.ended = false;
      this.overlay.setEnd(null);
      void this.run(target);
      return;
    }
    this.jumpTo = target;
    this.ticket.cancel();
  }

  restart(): void {
    this.goto(0);
  }

  togglePause(): void {
    if (!this.running || this.ended) return;
    this.setPaused(!this.paused);
  }

  private setPaused(p: boolean): void {
    this.timeline.paused = p;
    this.autopilot.paused = p;
    this.director.paused = p;
    this.overlay.setPaused(p);
  }

  /** Keyboard and gamepad while the tour runs. */
  onAction(a: Action): void {
    if (a === 'escape') {
      if (this.host.scrollOpen()) this.finishReading();
      else this.exit(this.ended ? 'finished' : 'exit');
    } else if (a === 'jump') this.togglePause();
    else if (a === 'interact') {
      if (this.ended) this.exit('finished');
      else this.next();
    } else if (a === 'next') this.next();
    else if (a === 'prev') this.goto(Math.max(0, this.index - 1));
  }

  private finishReading(): void {
    this.continueReading = true;
  }

  update(dt: number): void {
    if (!this.running) return;
    // Moving the panda by hand takes over from the tour (checked before the script runs
    // on, so nothing it does this frame happens after the visitor took the controls).
    const m = this.app.input.move;
    if (m.lengthSq() > 0.25 && !this.host.scrollOpen() && !this.ended) {
      this.takeover += dt;
      if (this.takeover > 0.12) {
        this.exit('takeover');
        return;
      }
    } else this.takeover = 0;
    this.timeline.update(dt);
    if (this.reading) {
      const f = (this.timeline.now - this.reading.start) / this.reading.duration;
      this.overlay.setReading(true, f);
      // Let the text scroll by gently for longer scrolls.
      const body = this.host.scrollBody();
      if (body && !this.paused) {
        const room = body.scrollHeight - body.clientHeight;
        if (room > 8) {
          const k = Math.min(1, Math.max(0, (f - 0.3) / 0.6));
          const eased = k * k * (3 - 2 * k);
          body.scrollTop = Math.max(body.scrollTop, eased * room);
        }
      }
    }
  }

  private async run(from: number): Promise<void> {
    const id = ++this.runId;
    let i = from;
    while (this.running && id === this.runId && i < CHAPTERS.length) {
      this.index = i;
      this.jumpTo = null;
      this.ticket = new Ticket();
      const chapter = CHAPTERS[i]!;
      this.overlay.setChapter(chapter.section ? SECTION_CHAPTERS.indexOf(i) : i === 0 ? -1 : 99);
      try {
        await chapter.run(this.context(this.ticket));
      } catch (e) {
        if (!(e instanceof Cancelled)) console.error(e);
      }
      if (!this.running || id !== this.runId) return;
      this.cleanup();
      i = this.jumpTo ?? i + 1;
    }
    if (this.running && id === this.runId) {
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
    if (this.host.scrollOpen()) this.host.closeScroll();
    this.autopilot.stop();
    this.app.animator.lookTarget = null;
    this.autopilot.idleSeconds = 0;
  }

  private context(ticket: Ticket): TourContext {
    const app = this.app;
    const tl = this.timeline;
    const host = this.host;
    const overlay = this.overlay;
    const autopilot = this.autopilot;
    const c = app.controller;
    /** Every step first makes sure its chapter is still playing. */
    const live = () => ticket.check();
    const wait = (s: number) => tl.wait(s, ticket);
    const until = (done: () => boolean, timeout?: number) => tl.until(done, ticket, timeout);
    /** Runs `fn` after `seconds` of tour time, unless the chapter ends first. */
    const later = (seconds: number, fn: () => void) => {
      tl.wait(seconds, ticket).then(fn, () => undefined);
    };
    let cardId = 0;
    let captionId = 0;
    const go = (points: XZ[], o: { run?: boolean } = {}) => {
      live();
      const route = new Route([[c.position.x, c.position.z], ...points]);
      autopilot.walk(route, o.run ?? false);
      return route;
    };
    const fade = async (on: boolean, seconds: number, hold: number) => {
      live();
      this.dark = on;
      overlay.fade(on, seconds);
      await wait(hold);
    };
    const isDark = () => this.dark;
    return {
      app,
      content: app.content,
      anchors: app.architecture.anchors,
      subject: () => {
        this.subjectPose.position.copy(c.position);
        this.subjectPose.yaw = c.yaw;
        return this.subjectPose;
      },
      panda: () => tmp.copy(c.position),
      arrived: () => autopilot.done,
      wait,
      until,
      go: (points, o) => void go(points, o),
      walk: async (points, o = {}) => {
        const route = go(points, o);
        const speed = o.run ? 5.5 : 2.6;
        await until(() => autopilot.done, route.length / speed + 5);
        if (!autopilot.done) {
          // Held up somewhere: finish the move off-camera rather than stall the film.
          const [x, z] = route.end;
          c.teleport(x, z, c.yaw);
          autopilot.stop();
        }
      },
      face: (x, z) => {
        live();
        autopilot.face(x, z);
      },
      look: (p) => {
        live();
        app.animator.lookTarget = p;
      },
      place: (x, z, yaw) => {
        live();
        autopilot.stop();
        c.teleport(x, z, yaw);
        app.scarf.snap();
        app.panda.root.position.copy(c.position);
      },
      emote: (action) => {
        live();
        app.animator.play(action);
      },
      cut: (shot, blend = 0) => {
        live();
        this.director.cut(shot, blend);
      },
      get dark() {
        return isDark();
      },
      fadeOut: (s = 0.7) => fade(true, s, s),
      fadeIn: (s = 0.9) => fade(false, s, s * 0.3),
      card: (section) => {
        live();
        overlay.setCard(chapterCard(section, app.content));
        host.sound('chime');
        const id = ++cardId;
        later(3.6, () => id === cardId && overlay.setCard(null));
      },
      title: (on) => {
        live();
        overlay.setTitle(
          on
            ? {
                title: app.content.site.title,
                owner: app.content.owner.name.includes('[')
                  ? undefined
                  : `${app.content.owner.name} · ${app.content.owner.role}`,
                tagline: app.content.site.tagline,
              }
            : null,
        );
      },
      caption: (text, seconds = 4.8) => {
        live();
        overlay.setCaption(text);
        const id = ++captionId;
        if (text) later(seconds, () => id === captionId && overlay.setCaption(null));
      },
      ceremony: async (section) => {
        live();
        host.ceremony(section);
        await wait(CEREMONY_MS / 1000);
      },
      read: async (section, focus) => {
        live();
        // never read in the dark
        if (this.dark) await fade(false, 0.5, 0.3);
        const rose = host.openScroll(section, focus, true);
        const body = host.scrollBody();
        const words = body?.textContent?.split(/\s+/).filter(Boolean).length ?? 40;
        // time to read, plus the scroll's rise and unrolling
        const duration = readingTime(words) + (rose ? ScrollPanel.RISE_MS / 1000 : 0);
        this.continueReading = false;
        this.reading = { start: tl.now, duration };
        overlay.setReading(true, 0);
        try {
          await until(
            () =>
              this.continueReading ||
              !host.scrollOpen() ||
              tl.now - this.reading!.start >= duration,
          );
        } finally {
          this.reading = null;
          this.continueReading = false;
          overlay.setReading(false);
        }
        if (host.scrollOpen()) host.closeScroll();
        await wait(0.5);
      },
      strike: async (dummy) => {
        live();
        host.strikeDummy(dummy);
        await wait(0.8);
      },
      drum: async () => {
        live();
        host.beatDrum();
        await wait(0.9);
      },
      bell: async () => {
        live();
        let rung = false;
        if (!host.ringBell(() => (rung = true))) rung = true;
        await until(() => rung, 4);
      },
      meditate: (on) => {
        live();
        autopilot.idleSeconds = on ? 30 : 0;
      },
    };
  }
}
