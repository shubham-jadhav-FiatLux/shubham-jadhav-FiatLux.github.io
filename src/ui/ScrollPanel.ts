import { Emitter } from '../core/Emitter';
import { SECTIONS, sectionMeta, type SectionId } from '../content/sections';
import type { PortfolioContent } from '../content/types';
import type { Progress } from '../zones/Progress';
import { releaseFocus, trapFocus } from './focus';
import { reduceMotion, scrollWithin } from './scrolling';
import { ICONS } from './icons';
import { esc, renderSection, sectionTitle } from './render';

export type ScrollEvents = {
  open: SectionId;
  close: void;
  travel: SectionId;
  switch: SectionId;
  project: number;
};

/**
 * The hanging scroll that unrolls with a section's content. Tabs switch between the
 * scrolls already found; undiscovered ones offer a hint and quick travel.
 */
export class ScrollPanel extends Emitter<ScrollEvents> {
  readonly el: HTMLElement;
  isOpen = false;
  section: SectionId = 'welcome';
  private focus: number | undefined;
  private title: HTMLElement;
  private glyph: HTMLElement;
  private tabs: HTMLElement;
  private body: HTMLElement;
  /** shown by the tour: no tabs or quick travel, and the keyboard stays with the film */
  private film = false;

  constructor(
    root: HTMLElement,
    private readonly content: PortfolioContent,
    private readonly progress: Progress,
  ) {
    super();
    this.el = document.createElement('div');
    this.el.className = 'overlay';
    this.el.innerHTML = `
      <div class="scroll" role="dialog" aria-modal="true" aria-labelledby="scroll-title">
        <div class="scroll__glow" aria-hidden="true"></div>
        <div class="scroll__roller scroll__roller--top" aria-hidden="true"></div>
        <div class="scroll__paper">
          <header class="scroll__head">
            <span class="seal" aria-hidden="true"></span>
            <h2 class="scroll__title" id="scroll-title"></h2>
            <button type="button" class="icon-btn scroll__close" aria-label="Close scroll (Esc)">${ICONS.close}</button>
          </header>
          <div class="scroll__tabs" role="tablist" aria-label="Scrolls"></div>
          <div class="scroll__body prose" tabindex="0"></div>
          <footer class="scroll__foot">Esc to close · ← → to switch scrolls</footer>
        </div>
        <div class="scroll__roller scroll__roller--bottom" aria-hidden="true"></div>
      </div>`;
    root.appendChild(this.el);
    this.title = this.el.querySelector('.scroll__title')!;
    this.glyph = this.el.querySelector('.scroll__head .seal')!;
    this.tabs = this.el.querySelector('.scroll__tabs')!;
    this.body = this.el.querySelector('.scroll__body')!;
    this.el.querySelector('.scroll__close')!.addEventListener('click', () => this.close());
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) this.close();
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        if (e.target instanceof HTMLElement && e.target.closest('.scroll__body')) return;
        e.preventDefault();
        this.step(e.key === 'ArrowRight' ? 1 : -1);
      }
    });
    this.body.addEventListener('click', (e) => this.onBodyClick(e));
    trapFocus(this.el, () => this.isOpen && !this.film);
    progress.on('discover', () => this.isOpen && this.renderTabs());
  }

  /** The scrollable text of the scroll. */
  get bodyEl(): HTMLElement {
    return this.body;
  }

  /**
   * While the tour shows the scrolls they are part of the film: no tabs, no quick travel,
   * and the focus is not pulled in, so Space still pauses and Tab reaches "Continue".
   */
  setFilm(on: boolean): void {
    this.film = on;
    this.el.classList.toggle('overlay--film', on);
    this.el.querySelector('.scroll')!.setAttribute('aria-modal', String(!on));
  }

  /**
   * Unrolls the scroll for `section`. With `from` (a point on screen, in CSS pixels) the
   * rolled scroll first rises out of that point along a curve, like a genie from a lamp,
   * and unrolls once it has arrived. Returns true if it rises (not with reduced motion).
   */
  open(section: SectionId, focus?: number, from?: { x: number; y: number }): boolean {
    this.section = section;
    this.focus = focus;
    this.render();
    let rose = false;
    if (!this.isOpen) {
      this.isOpen = true;
      rose = !!from && !reduceMotion() && this.rise(from);
      this.el.classList.add('overlay--open');
      window.setTimeout(() => {
        if (this.isOpen && !this.film)
          (this.el.querySelector('.scroll__close') as HTMLElement)?.focus();
      }, 60);
    }
    this.emit('open', section);
    return rose;
  }

  /** How long the scroll takes to rise and unroll after `open` (ms). */
  static readonly RISE_MS = 1650;

  private riseTimer = 0;
  private flights: Animation[] = [];

  private rise(from: { x: number; y: number }): boolean {
    this.land();
    const scroll = this.el.querySelector<HTMLElement>('.scroll')!;
    // layout boxes (not transformed): where the scroll will rest, centred in the overlay
    const w = scroll.offsetWidth;
    const h = scroll.offsetHeight;
    if (!w || !h) return false;
    this.el.classList.add('overlay--rolled');
    this.roll();
    const dx = from.x - (scroll.offsetLeft + w / 2);
    const dy = from.y - (scroll.offsetTop + h / 2);
    // A cubic Bezier from the point to the scroll's place: up out of the lamp first,
    // then a lazy curve across, drifting in from the side the panda stands on.
    const p0 = { x: dx, y: dy };
    const p1 = { x: dx, y: dy - Math.max(120, h * 0.55) };
    const p2 = { x: dx * 0.18, y: -h * 0.12 };
    const p3 = { x: 0, y: 0 };
    const frames: Keyframe[] = [];
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const v = 1 - u;
      const x = v * v * v * p0.x + 3 * v * v * u * p1.x + 3 * v * u * u * p2.x + u * u * u * p3.x;
      const y = v * v * v * p0.y + 3 * v * v * u * p1.y + 3 * v * u * u * p2.y + u * u * u * p3.y;
      // a thin wisp that swells into the scroll
      const grow = 1 - Math.pow(1 - u, 2.2);
      const sx = 0.03 + 0.97 * Math.pow(grow, 1.6);
      const sy = 0.1 + 0.9 * grow;
      const sway = Math.sin(u * Math.PI * 2.5) * 6 * (1 - u);
      frames.push({
        offset: u,
        transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${sway.toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`,
        opacity: Math.min(1, u * 5),
      });
    }
    const timing = { duration: 900, easing: 'cubic-bezier(0.33, 0, 0.2, 1)' };
    const glow = this.el.querySelector<HTMLElement>('.scroll__glow')!;
    this.flights = [
      scroll.animate(frames, timing),
      // golden light around it, fading as it arrives (only opacity: cheap to animate)
      glow.animate([{ opacity: 1 }, { opacity: 0.85, offset: 0.55 }, { opacity: 0 }], timing),
    ];
    // Arrived: unroll.
    this.riseTimer = window.setTimeout(() => this.el.classList.remove('overlay--rolled'), 860);
    return true;
  }

  /** While rolled, the two rollers meet in the middle of the scroll (its height can change). */
  private roll(): void {
    if (!this.el.classList.contains('overlay--rolled')) return;
    const scroll = this.el.querySelector<HTMLElement>('.scroll')!;
    scroll.style.setProperty('--roll', `${Math.max(0, scroll.offsetHeight / 2 - 22)}px`);
  }

  /** Ends a rise at once: the scroll is where it rests, unrolled. */
  private land(): void {
    window.clearTimeout(this.riseTimer);
    for (const a of this.flights) a.cancel();
    this.flights = [];
    this.el.classList.remove('overlay--rolled');
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.land();
    this.el.classList.remove('overlay--open');
    releaseFocus(this.el);
    this.emit('close', undefined);
  }

  /** Next / previous found scroll (keyboard, gamepad shoulder buttons). */
  step(dir: 1 | -1): void {
    const found = SECTIONS.filter((s) => this.progress.has(s.id));
    if (!found.length) return;
    const i = found.findIndex((s) => s.id === this.section);
    const next = found[(i + dir + found.length) % found.length]!;
    this.switchTo(next.id);
  }

  private switchTo(id: SectionId): void {
    this.section = id;
    this.focus = undefined;
    this.render();
    this.emit('switch', id);
  }

  private render(): void {
    const meta = sectionMeta(this.section);
    this.glyph.textContent = meta.glyph;
    this.title.textContent = sectionTitle(this.section, this.content);
    this.renderTabs();
    if (this.progress.has(this.section)) {
      this.body.innerHTML = renderSection(this.section, this.content, this.focus);
    } else {
      this.body.innerHTML = `<div class="locked">
        <span class="seal" aria-hidden="true">${meta.glyph}</span>
        <p>This scroll is still hidden somewhere in the valley. Look for it at <strong>${esc(meta.place)}</strong>.</p>
        <p><button type="button" class="btn btn--seal" data-travel="${meta.id}">Travel there</button></p>
      </div>`;
    }
    this.body.scrollTop = 0;
    this.roll();
    const focused = this.body.querySelector('.card--focus, .timeline--focus');
    if (focused) window.setTimeout(() => scrollWithin(this.body, focused, 'center'), 400);
  }

  private renderTabs(): void {
    this.tabs.innerHTML = SECTIONS.map((s) => {
      const found = this.progress.has(s.id);
      return `<button type="button" role="tab" class="tab${found ? ' tab--found' : ''}" data-tab="${s.id}"
        aria-selected="${s.id === this.section}" title="${found ? esc(s.label) : `Not found yet: ${esc(s.place)}`}">
        <i aria-hidden="true">${s.glyph}</i><span>${esc(s.label)}</span></button>`;
    }).join('');
    this.tabs
      .querySelectorAll<HTMLButtonElement>('[data-tab]')
      .forEach((b) => b.addEventListener('click', () => this.switchTo(b.dataset.tab as SectionId)));
  }

  private onBodyClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const travel = t.closest<HTMLElement>('[data-travel]');
    if (travel && !this.film) {
      this.emit('travel', travel.dataset.travel as SectionId);
      return;
    }
    const project = t.closest<HTMLElement>('[data-project]');
    if (project) {
      this.focus = Number(project.dataset.project);
      this.body.innerHTML = renderSection('projects', this.content, this.focus);
      this.emit('project', this.focus);
      return;
    }
    const copy = t.closest<HTMLElement>('[data-copy]');
    if (copy) {
      const text = copy.dataset.copy ?? '';
      navigator.clipboard?.writeText(text).then(
        () => (copy.textContent = 'Copied!'),
        () => (copy.textContent = text),
      );
    }
  }
}
