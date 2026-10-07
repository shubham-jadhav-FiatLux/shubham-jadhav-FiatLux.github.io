import { Emitter } from '../core/Emitter';
import { releaseFocus } from './focus';
import { sj_ICONS } from './icons';
import { esc } from './render';

export type TourOverlayEvents = {
  pause: void;
  next: void;
  exit: void;
  chapter: number;
  continue: void;
  again: void;
  explore: void;
  classic: void;
};

/** A pop-up note in the film (a skill group after a strike, for example). */
export interface Callout {
  glyph: string;
  kicker: string;
  title: string;
  items: string[];
}

export interface ChapterCard {
  glyph: string;
  /** small line above the title, e.g. "Chapter 2 · The tea pavilion" */
  kicker: string;
  title: string;
}

/**
 * The film's frame around the valley: letterbox bars, a chapter strip, title cards,
 * subtitles, fades between scenes, the reading control while a scroll is open, and the
 * closing card. Controls fade out while nobody touches the mouse, like a video player.
 */
export class TourOverlay extends Emitter<TourOverlayEvents> {
  readonly el: HTMLElement;
  private chapters: HTMLElement;
  private card: HTMLElement;
  private title: HTMLElement;
  private caption: HTMLElement;
  private callout: HTMLElement;
  private readingFill: HTMLElement;
  private fadeEl: HTMLElement;
  private endEl: HTMLElement;
  private live: HTMLElement;
  private pauseBtn: HTMLButtonElement;
  private continueBtn: HTMLButtonElement;
  private bars: HTMLElement[];
  private readingEl: HTMLElement;
  private idleTimer = 0;

  constructor(sj_root: HTMLElement, sj_site: { title: string; seal: string }) {
    super();
    this.el = document.createElement('div');
    this.el.className = 'tour';
    this.el.innerHTML = `
      <div class="tour__bar tour__bar--top">
        <div class="tour__brand"><span class="seal" aria-hidden="true">影</span>
          <span>${esc(sj_site.title)} <em>· the tour</em></span></div>
        <div class="tour__controls" role="group" aria-label="Tour controls">
          <button type="button" class="tour__btn" data-act="pause" aria-label="Pause the tour (Space)" title="Pause (Space)">${sj_ICONS.pause}</button>
          <button type="button" class="tour__btn" data-act="next" aria-label="Skip to the next chapter (Enter)" title="Next chapter (Enter)">${sj_ICONS.next}</button>
          <button type="button" class="tour__btn tour__btn--text" data-act="exit" title="Walk on your own (Esc or WASD)">Take the controls</button>
        </div>
      </div>
      <div class="tour__bar tour__bar--bottom">
        <p class="tour__caption" aria-hidden="true"></p>
        <ol class="tour__chapters" aria-label="Chapters"></ol>
      </div>
      <div class="tour__card" aria-hidden="true">
        <span class="seal tour__card-seal"></span>
        <div><p class="tour__kicker"></p><h2 class="tour__card-title"></h2></div>
      </div>
      <div class="tour__title" aria-hidden="true"></div>
      <div class="tour__callout" aria-hidden="true">
        <span class="seal tour__callout-seal"></span>
        <div class="tour__callout-text">
          <p class="tour__callout-kicker"></p>
          <h3 class="tour__callout-title"></h3>
          <ul class="tour__callout-items"></ul>
        </div>
      </div>
      <div class="tour__reading">
        <button type="button" class="tour__continue">
          <span class="tour__continue-fill" aria-hidden="true"></span>
          <span class="tour__continue-label">Continue the tour</span>${sj_ICONS.next}
        </button>
      </div>
      <div class="tour__fade" aria-hidden="true"></div>
      <div class="tour__end" role="dialog" aria-modal="false" aria-labelledby="tour-end-title">
        <div class="tour__end-card">
          <span class="seal seal--lg" aria-hidden="true">${esc(sj_site.seal)}</span>
          <h2 id="tour-end-title">Thank you for watching</h2>
          <p class="tour__end-owner"></p>
          <div class="tour__end-actions">
            <button type="button" class="btn btn--seal" data-end="explore">Explore on your own</button>
            <button type="button" class="btn btn--ghost" data-end="again">Watch again</button>
          </div>
          <button type="button" class="linkish" data-end="classic">Read it as a page</button>
        </div>
      </div>
      <div class="sr-only" aria-live="polite"></div>`;
    sj_root.appendChild(this.el);
    this.chapters = this.el.querySelector('.tour__chapters')!;
    this.card = this.el.querySelector('.tour__card')!;
    this.title = this.el.querySelector('.tour__title')!;
    this.caption = this.el.querySelector('.tour__caption')!;
    this.callout = this.el.querySelector('.tour__callout')!;
    this.readingFill = this.el.querySelector('.tour__continue-fill')!;
    this.fadeEl = this.el.querySelector('.tour__fade')!;
    this.endEl = this.el.querySelector('.tour__end')!;
    this.live = this.el.querySelector('[aria-live]')!;
    this.pauseBtn = this.el.querySelector('[data-act="pause"]')!;
    this.continueBtn = this.el.querySelector('.tour__continue')!;
    this.bars = [...this.el.querySelectorAll<HTMLElement>('.tour__bar')];
    this.readingEl = this.el.querySelector('.tour__reading')!;

    this.el
      .querySelectorAll<HTMLButtonElement>('[data-act]')
      .forEach((sj_b) =>
        onPress(sj_b, () => this.emit(sj_b.dataset.act as 'pause' | 'next' | 'exit', undefined)),
      );
    onPress(this.continueBtn, () => this.emit('continue', undefined));
    this.el
      .querySelectorAll<HTMLButtonElement>('[data-end]')
      .forEach((sj_b) =>
        onPress(sj_b, () =>
          this.emit(sj_b.dataset.end as 'again' | 'explore' | 'classic', undefined),
        ),
      );
    this.sync();
    // Controls fade away while the pointer rests, and come back on any movement.
    const sj_wake = () => this.wake();
    window.addEventListener('pointermove', sj_wake, { passive: true });
    window.addEventListener('pointerdown', sj_wake, { passive: true });
    window.addEventListener('keydown', sj_wake);
  }

  get visible(): boolean {
    return this.el.classList.contains('tour--on');
  }

  show(sj_chapters: { glyph: string; label: string }[]): void {
    this.chapters.innerHTML = sj_chapters
      .map(
        (sj_c, sj_i) =>
          `<li><button type="button" class="tour__chapter" data-chapter="${sj_i}" title="${esc(sj_c.label)}"
            aria-label="Chapter ${sj_i + 1}: ${esc(sj_c.label)}">${esc(sj_c.glyph)}</button></li>`,
      )
      .join('');
    this.chapters
      .querySelectorAll<HTMLButtonElement>('[data-chapter]')
      .forEach((sj_b) => onPress(sj_b, () => this.emit('chapter', Number(sj_b.dataset.chapter))));
    this.el.classList.remove('tour--ended');
    this.el.classList.add('tour--on');
    this.setPaused(false);
    this.sync();
    this.wake();
  }

  hide(): void {
    // Nothing hidden may keep the focus: Space and Enter belong to the game again.
    releaseFocus(this.el);
    this.el.classList.remove(
      'tour--on',
      'tour--reading',
      'tour--ended',
      'tour--paused',
      'tour--idle',
    );
    window.clearTimeout(this.idleTimer);
    this.setCard(null);
    this.setTitle(null);
    this.setCaption(null);
    this.setCallout(null);
    this.fade(false, 0.4);
    this.sync();
  }

  /** Highlights the current chapter (index into the list given to `show`), -1 for none. */
  setChapter(sj_index: number): void {
    this.chapters.querySelectorAll<HTMLButtonElement>('[data-chapter]').forEach((sj_b) => {
      const sj_i = Number(sj_b.dataset.chapter);
      sj_b.classList.toggle('tour__chapter--done', sj_i < sj_index);
      sj_b.classList.toggle('tour__chapter--now', sj_i === sj_index);
      if (sj_i === sj_index) sj_b.setAttribute('aria-current', 'step');
      else sj_b.removeAttribute('aria-current');
    });
  }

  setPaused(sj_paused: boolean): void {
    this.el.classList.toggle('tour--paused', sj_paused);
    this.pauseBtn.innerHTML = sj_paused ? sj_ICONS.play : sj_ICONS.pause;
    this.pauseBtn.setAttribute(
      'aria-label',
      sj_paused ? 'Resume the tour (Space)' : 'Pause the tour (Space)',
    );
    this.pauseBtn.title = sj_paused ? 'Resume (Space)' : 'Pause (Space)';
    if (sj_paused) this.wake(true);
  }

  /** Chapter title card, lower left; `null` hides it. */
  setCard(sj_c: ChapterCard | null): void {
    if (!sj_c) {
      this.card.classList.remove('tour__card--on');
      return;
    }
    this.card.querySelector('.tour__card-seal')!.textContent = sj_c.glyph;
    this.card.querySelector('.tour__kicker')!.textContent = sj_c.kicker;
    this.card.querySelector('.tour__card-title')!.textContent = sj_c.title;
    this.card.classList.remove('tour__card--on');
    void this.card.offsetWidth;
    this.card.classList.add('tour__card--on');
    this.say(`${sj_c.kicker}: ${sj_c.title}`);
  }

  /** The opening title over the valley. */
  setTitle(sj_t: { title: string; owner?: string; tagline: string } | null): void {
    if (!sj_t) {
      this.title.classList.remove('tour__title--on');
      return;
    }
    this.title.innerHTML = `<h1>${esc(sj_t.title)}</h1>
      ${sj_t.owner ? `<p class="tour__title-owner">${esc(sj_t.owner)}</p>` : ''}
      <p class="tour__title-tagline">${esc(sj_t.tagline)}</p>`;
    this.title.classList.add('tour__title--on');
    this.say(sj_t.owner ? `${sj_t.title}, ${sj_t.owner}` : sj_t.title);
  }

  /** A note that pops up over the picture (lower right); `null` hides it. */
  setCallout(sj_c: Callout | null): void {
    if (!sj_c) {
      this.callout.classList.remove('tour__callout--on');
      return;
    }
    this.callout.querySelector('.tour__callout-seal')!.textContent = sj_c.glyph;
    this.callout.querySelector('.tour__callout-kicker')!.textContent = sj_c.kicker;
    this.callout.querySelector('.tour__callout-title')!.textContent = sj_c.title;
    this.callout.querySelector('.tour__callout-items')!.innerHTML = sj_c.items
      .map((sj_item, sj_i) => `<li style="--i:${sj_i}">${esc(sj_item)}</li>`)
      .join('');
    this.callout.classList.remove('tour__callout--on');
    void this.callout.offsetWidth;
    this.callout.classList.add('tour__callout--on');
    this.say(`${sj_c.title}: ${sj_c.items.join(', ')}`);
  }

  /** A line of narration in the lower bar; `null` clears it. */
  setCaption(sj_text: string | null): void {
    if (!sj_text) {
      this.caption.classList.remove('tour__caption--on');
      return;
    }
    this.caption.textContent = sj_text;
    this.caption.classList.remove('tour__caption--on');
    void this.caption.offsetWidth;
    this.caption.classList.add('tour__caption--on');
    this.say(sj_text);
  }

  /** Reading mode: bars step aside for the scroll; `sj_fraction` fills the continue button. */
  setReading(sj_active: boolean, sj_fraction = 0): void {
    this.readingFill.style.transform = `scaleX(${Math.min(1, Math.max(0, sj_fraction))})`;
    if (sj_active === this.el.classList.contains('tour--reading')) return;
    // A keyboard user in the tour controls follows them: to Continue and back.
    const sj_within = this.el.contains(document.activeElement);
    this.el.classList.toggle('tour--reading', sj_active);
    this.sync();
    if (sj_within) (sj_active ? this.continueBtn : this.pauseBtn).focus({ preventScroll: true });
  }

  /** Fades the picture to black (on) or back (off) over `sj_seconds`. */
  fade(sj_on: boolean, sj_seconds: number): void {
    this.fadeEl.style.transitionDuration = `${sj_seconds}s`;
    this.fadeEl.classList.toggle('tour__fade--on', sj_on);
  }

  /** The closing card; `null` hides it. */
  setEnd(sj_end: { owner?: string } | null): void {
    this.el.classList.toggle('tour--ended', !!sj_end);
    this.sync();
    if (!sj_end) return;
    this.endEl.querySelector('.tour__end-owner')!.textContent = sj_end.owner ?? '';
    window.setTimeout(() => {
      if (this.el.classList.contains('tour--ended'))
        (this.endEl.querySelector('[data-end="explore"]') as HTMLElement)?.focus();
    }, 600);
  }

  private say(sj_text: string): void {
    this.live.textContent = sj_text;
  }

  /** Only what is on screen can be reached with Tab (or a screen reader). */
  private sync(): void {
    const sj_on = this.visible;
    const sj_reading = this.el.classList.contains('tour--reading');
    const sj_ended = this.el.classList.contains('tour--ended');
    this.el.inert = !sj_on;
    for (const sj_bar of this.bars) sj_bar.inert = sj_reading || sj_ended;
    this.readingEl.inert = !sj_reading;
    this.endEl.inert = !sj_ended;
  }

  private wake(sj_hold = false): void {
    if (!this.visible) return;
    this.el.classList.remove('tour--idle');
    window.clearTimeout(this.idleTimer);
    if (sj_hold) return;
    this.idleTimer = window.setTimeout(() => {
      if (!this.el.classList.contains('tour--paused')) this.el.classList.add('tour--idle');
    }, 2600);
  }
}

/**
 * Click handler for the film's buttons. A button pressed with the mouse or a finger lets
 * go of the focus, so Space and Enter keep meaning pause and next rather than pressing it
 * again; keyboard users keep their place.
 */
function onPress(sj_b: HTMLButtonElement, sj_fn: () => void): void {
  sj_b.addEventListener('click', (sj_e) => {
    if (sj_e.detail > 0) sj_b.blur();
    sj_fn();
  });
}
