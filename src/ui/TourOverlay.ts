import { Emitter } from '../core/Emitter';
import { releaseFocus } from './focus';
import { ICONS } from './icons';
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

  constructor(root: HTMLElement, siteTitle: string) {
    super();
    this.el = document.createElement('div');
    this.el.className = 'tour';
    this.el.innerHTML = `
      <div class="tour__bar tour__bar--top">
        <div class="tour__brand"><span class="seal" aria-hidden="true">影</span>
          <span>${esc(siteTitle)} <em>· the tour</em></span></div>
        <div class="tour__controls" role="group" aria-label="Tour controls">
          <button type="button" class="tour__btn" data-act="pause" aria-label="Pause the tour (Space)" title="Pause (Space)">${ICONS.pause}</button>
          <button type="button" class="tour__btn" data-act="next" aria-label="Skip to the next chapter (Enter)" title="Next chapter (Enter)">${ICONS.next}</button>
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
          <span class="tour__continue-label">Continue the tour</span>${ICONS.next}
        </button>
      </div>
      <div class="tour__fade" aria-hidden="true"></div>
      <div class="tour__end" role="dialog" aria-modal="false" aria-labelledby="tour-end-title">
        <div class="tour__end-card">
          <span class="seal seal--lg" aria-hidden="true">竹</span>
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
    root.appendChild(this.el);
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
      .forEach((b) =>
        onPress(b, () => this.emit(b.dataset.act as 'pause' | 'next' | 'exit', undefined)),
      );
    onPress(this.continueBtn, () => this.emit('continue', undefined));
    this.el
      .querySelectorAll<HTMLButtonElement>('[data-end]')
      .forEach((b) =>
        onPress(b, () => this.emit(b.dataset.end as 'again' | 'explore' | 'classic', undefined)),
      );
    this.sync();
    // Controls fade away while the pointer rests, and come back on any movement.
    const wake = () => this.wake();
    window.addEventListener('pointermove', wake, { passive: true });
    window.addEventListener('pointerdown', wake, { passive: true });
    window.addEventListener('keydown', wake);
  }

  get visible(): boolean {
    return this.el.classList.contains('tour--on');
  }

  show(chapters: { glyph: string; label: string }[]): void {
    this.chapters.innerHTML = chapters
      .map(
        (c, i) =>
          `<li><button type="button" class="tour__chapter" data-chapter="${i}" title="${esc(c.label)}"
            aria-label="Chapter ${i + 1}: ${esc(c.label)}">${esc(c.glyph)}</button></li>`,
      )
      .join('');
    this.chapters
      .querySelectorAll<HTMLButtonElement>('[data-chapter]')
      .forEach((b) => onPress(b, () => this.emit('chapter', Number(b.dataset.chapter))));
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
  setChapter(index: number): void {
    this.chapters.querySelectorAll<HTMLButtonElement>('[data-chapter]').forEach((b) => {
      const i = Number(b.dataset.chapter);
      b.classList.toggle('tour__chapter--done', i < index);
      b.classList.toggle('tour__chapter--now', i === index);
      if (i === index) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
  }

  setPaused(paused: boolean): void {
    this.el.classList.toggle('tour--paused', paused);
    this.pauseBtn.innerHTML = paused ? ICONS.play : ICONS.pause;
    this.pauseBtn.setAttribute(
      'aria-label',
      paused ? 'Resume the tour (Space)' : 'Pause the tour (Space)',
    );
    this.pauseBtn.title = paused ? 'Resume (Space)' : 'Pause (Space)';
    if (paused) this.wake(true);
  }

  /** Chapter title card, lower left; `null` hides it. */
  setCard(c: ChapterCard | null): void {
    if (!c) {
      this.card.classList.remove('tour__card--on');
      return;
    }
    this.card.querySelector('.tour__card-seal')!.textContent = c.glyph;
    this.card.querySelector('.tour__kicker')!.textContent = c.kicker;
    this.card.querySelector('.tour__card-title')!.textContent = c.title;
    this.card.classList.remove('tour__card--on');
    void this.card.offsetWidth;
    this.card.classList.add('tour__card--on');
    this.say(`${c.kicker}: ${c.title}`);
  }

  /** The opening title over the valley. */
  setTitle(t: { title: string; owner?: string; tagline: string } | null): void {
    if (!t) {
      this.title.classList.remove('tour__title--on');
      return;
    }
    this.title.innerHTML = `<h1>${esc(t.title)}</h1>
      ${t.owner ? `<p class="tour__title-owner">${esc(t.owner)}</p>` : ''}
      <p class="tour__title-tagline">${esc(t.tagline)}</p>`;
    this.title.classList.add('tour__title--on');
    this.say(t.owner ? `${t.title}, ${t.owner}` : t.title);
  }

  /** A note that pops up over the picture (lower right); `null` hides it. */
  setCallout(c: Callout | null): void {
    if (!c) {
      this.callout.classList.remove('tour__callout--on');
      return;
    }
    this.callout.querySelector('.tour__callout-seal')!.textContent = c.glyph;
    this.callout.querySelector('.tour__callout-kicker')!.textContent = c.kicker;
    this.callout.querySelector('.tour__callout-title')!.textContent = c.title;
    this.callout.querySelector('.tour__callout-items')!.innerHTML = c.items
      .map((item, i) => `<li style="--i:${i}">${esc(item)}</li>`)
      .join('');
    this.callout.classList.remove('tour__callout--on');
    void this.callout.offsetWidth;
    this.callout.classList.add('tour__callout--on');
    this.say(`${c.title}: ${c.items.join(', ')}`);
  }

  /** A line of narration in the lower bar; `null` clears it. */
  setCaption(text: string | null): void {
    if (!text) {
      this.caption.classList.remove('tour__caption--on');
      return;
    }
    this.caption.textContent = text;
    this.caption.classList.remove('tour__caption--on');
    void this.caption.offsetWidth;
    this.caption.classList.add('tour__caption--on');
    this.say(text);
  }

  /** Reading mode: bars step aside for the scroll; `fraction` fills the continue button. */
  setReading(active: boolean, fraction = 0): void {
    this.readingFill.style.transform = `scaleX(${Math.min(1, Math.max(0, fraction))})`;
    if (active === this.el.classList.contains('tour--reading')) return;
    // A keyboard user in the tour controls follows them: to Continue and back.
    const within = this.el.contains(document.activeElement);
    this.el.classList.toggle('tour--reading', active);
    this.sync();
    if (within) (active ? this.continueBtn : this.pauseBtn).focus({ preventScroll: true });
  }

  /** Fades the picture to black (on) or back (off) over `seconds`. */
  fade(on: boolean, seconds: number): void {
    this.fadeEl.style.transitionDuration = `${seconds}s`;
    this.fadeEl.classList.toggle('tour__fade--on', on);
  }

  /** The closing card; `null` hides it. */
  setEnd(end: { owner?: string } | null): void {
    this.el.classList.toggle('tour--ended', !!end);
    this.sync();
    if (!end) return;
    this.endEl.querySelector('.tour__end-owner')!.textContent = end.owner ?? '';
    window.setTimeout(() => {
      if (this.el.classList.contains('tour--ended'))
        (this.endEl.querySelector('[data-end="explore"]') as HTMLElement)?.focus();
    }, 600);
  }

  private say(text: string): void {
    this.live.textContent = text;
  }

  /** Only what is on screen can be reached with Tab (or a screen reader). */
  private sync(): void {
    const on = this.visible;
    const reading = this.el.classList.contains('tour--reading');
    const ended = this.el.classList.contains('tour--ended');
    this.el.inert = !on;
    for (const bar of this.bars) bar.inert = reading || ended;
    this.readingEl.inert = !reading;
    this.endEl.inert = !ended;
  }

  private wake(hold = false): void {
    if (!this.visible) return;
    this.el.classList.remove('tour--idle');
    window.clearTimeout(this.idleTimer);
    if (hold) return;
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
function onPress(b: HTMLButtonElement, fn: () => void): void {
  b.addEventListener('click', (e) => {
    if (e.detail > 0) b.blur();
    fn();
  });
}
