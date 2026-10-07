import { Emitter } from '../core/Emitter';
import { sj_SECTIONS, sectionMeta, type SectionId } from '../content/sections';
import type { PortfolioContent } from '../content/types';
import type { Progress } from '../zones/Progress';
import { releaseFocus, trapFocus } from './focus';
import { sj_reduceMotion, scrollWithin } from './scrolling';
import { sj_ICONS } from './icons';
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
  /** the last `open` began with the scroll rising out of a discovery (it unrolls later) */
  rising = false;
  section: SectionId = 'welcome';
  private focus: number | undefined;
  private title: HTMLElement;
  private glyph: HTMLElement;
  private sheet: HTMLElement;
  private tabs: HTMLElement;
  private body: HTMLElement;
  /** shown by the tour: no tabs or quick travel, and the keyboard stays with the film */
  private film = false;

  constructor(
    sj_root: HTMLElement,
    private readonly content: PortfolioContent,
    private readonly progress: Progress,
  ) {
    super();
    this.el = document.createElement('div');
    this.el.className = 'overlay';
    // A hanging scroll as it is mounted: a cord and a top rod, a "heaven" panel of
    // brocade with its two hanging strips, fret-patterned bands either side of the paper,
    // a shorter "earth" panel, and a heavy roller with jade knobs at the foot.
    this.el.innerHTML = `
      <div class="scroll" role="dialog" aria-modal="true" aria-labelledby="scroll-title">
        <div class="scroll__glow" aria-hidden="true"></div>
        <div class="scroll__roller scroll__roller--top" aria-hidden="true">
          <span class="scroll__cord"></span>
          <span class="scroll__tassel"></span>
        </div>
        <div class="scroll__paper">
          <i class="scroll__band" aria-hidden="true"></i>
          <div class="scroll__sheet">
            <header class="scroll__head">
              <span class="seal" aria-hidden="true"></span>
              <h2 class="scroll__title" id="scroll-title"></h2>
              <button type="button" class="icon-btn scroll__close" aria-label="Close scroll (Esc)">${sj_ICONS.close}</button>
            </header>
            <div class="scroll__tabs" role="tablist" aria-label="Scrolls"></div>
            <div class="scroll__body prose" tabindex="0"></div>
            <footer class="scroll__foot">
              <span>Esc to close, ← → to turn to another scroll</span>
              <span class="scroll__stamp" aria-hidden="true">${esc(content.site.seal)}</span>
            </footer>
          </div>
          <i class="scroll__band" aria-hidden="true"></i>
        </div>
        <div class="scroll__roller scroll__roller--bottom" aria-hidden="true"></div>
      </div>`;
    sj_root.appendChild(this.el);
    this.title = this.el.querySelector('.scroll__title')!;
    this.glyph = this.el.querySelector('.scroll__head .seal')!;
    this.sheet = this.el.querySelector('.scroll__sheet')!;
    this.tabs = this.el.querySelector('.scroll__tabs')!;
    this.body = this.el.querySelector('.scroll__body')!;
    this.el.querySelector('.scroll__close')!.addEventListener('click', () => this.close());
    this.el.addEventListener('pointerdown', (sj_e) => {
      if (sj_e.target === this.el) this.close();
    });
    this.el.addEventListener('keydown', (sj_e) => {
      if (sj_e.key === 'ArrowRight' || sj_e.key === 'ArrowLeft') {
        if (sj_e.target instanceof HTMLElement && sj_e.target.closest('.scroll__body')) return;
        sj_e.preventDefault();
        this.step(sj_e.key === 'ArrowRight' ? 1 : -1);
      }
    });
    this.body.addEventListener('click', (sj_e) => this.onBodyClick(sj_e));
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
  setFilm(sj_on: boolean): void {
    this.film = sj_on;
    this.el.classList.toggle('overlay--film', sj_on);
    this.el.querySelector('.scroll')!.setAttribute('aria-modal', String(!sj_on));
  }

  /**
   * Unrolls the scroll for `section`. With `from` (a point on screen, in CSS pixels) the
   * rolled scroll first rises out of that point along a curve, like a genie from a lamp,
   * and unrolls once it has arrived. Returns true if it rises (not with reduced motion).
   */
  open(sj_section: SectionId, sj_focus?: number, sj_from?: { x: number; y: number }): boolean {
    this.section = sj_section;
    this.focus = sj_focus;
    this.render();
    let sj_rose = false;
    if (!this.isOpen) {
      this.isOpen = true;
      sj_rose = !!sj_from && !sj_reduceMotion() && this.rise(sj_from);
      this.rising = sj_rose;
      this.el.classList.add('overlay--open');
      window.setTimeout(() => {
        if (this.isOpen && !this.film)
          (this.el.querySelector('.scroll__close') as HTMLElement)?.focus();
      }, 60);
    }
    this.emit('open', sj_section);
    return sj_rose;
  }

  /** How long the scroll takes to rise and unroll after `open` (ms). */
  static readonly RISE_MS = 1650;
  /** When, during a rise, the scroll has arrived and starts to unroll (ms). */
  static readonly UNROLL_AT_MS = 860;

  private riseTimer = 0;
  private flights: Animation[] = [];

  private rise(sj_from: { x: number; y: number }): boolean {
    this.land();
    const sj_scroll = this.el.querySelector<HTMLElement>('.scroll')!;
    // layout boxes (not transformed): where the scroll will rest, centred in the overlay
    const sj_w = sj_scroll.offsetWidth;
    const sj_h = sj_scroll.offsetHeight;
    if (!sj_w || !sj_h) return false;
    this.el.classList.add('overlay--rolled');
    this.roll();
    const sj_dx = sj_from.x - (sj_scroll.offsetLeft + sj_w / 2);
    const sj_dy = sj_from.y - (sj_scroll.offsetTop + sj_h / 2);
    // A cubic Bezier from the point to the scroll's place: up out of the lamp first,
    // then a lazy curve across, drifting in from the side the panda stands on.
    const sj_p0 = { x: sj_dx, y: sj_dy };
    const sj_p1 = { x: sj_dx, y: sj_dy - Math.max(120, sj_h * 0.55) };
    const sj_p2 = { x: sj_dx * 0.18, y: -sj_h * 0.12 };
    const sj_p3 = { x: 0, y: 0 };
    const sj_frames: Keyframe[] = [];
    const sj_n = 16;
    for (let sj_i = 0; sj_i <= sj_n; sj_i++) {
      const sj_u = sj_i / sj_n;
      const sj_v = 1 - sj_u;
      const sj_x =
        sj_v * sj_v * sj_v * sj_p0.x +
        3 * sj_v * sj_v * sj_u * sj_p1.x +
        3 * sj_v * sj_u * sj_u * sj_p2.x +
        sj_u * sj_u * sj_u * sj_p3.x;
      const sj_y =
        sj_v * sj_v * sj_v * sj_p0.y +
        3 * sj_v * sj_v * sj_u * sj_p1.y +
        3 * sj_v * sj_u * sj_u * sj_p2.y +
        sj_u * sj_u * sj_u * sj_p3.y;
      // a thin wisp that swells into the scroll
      const sj_grow = 1 - Math.pow(1 - sj_u, 2.2);
      const sj_sx = 0.03 + 0.97 * Math.pow(sj_grow, 1.6);
      const sj_sy = 0.1 + 0.9 * sj_grow;
      const sj_sway = Math.sin(sj_u * Math.PI * 2.5) * 6 * (1 - sj_u);
      sj_frames.push({
        offset: sj_u,
        transform: `translate(${sj_x.toFixed(1)}px, ${sj_y.toFixed(1)}px) rotate(${sj_sway.toFixed(2)}deg) scale(${sj_sx.toFixed(3)}, ${sj_sy.toFixed(3)})`,
        opacity: Math.min(1, sj_u * 5),
      });
    }
    const sj_timing = { duration: 900, easing: 'cubic-bezier(0.33, 0, 0.2, 1)' };
    const sj_glow = this.el.querySelector<HTMLElement>('.scroll__glow')!;
    this.flights = [
      sj_scroll.animate(sj_frames, sj_timing),
      // golden light around it, fading as it arrives (only opacity: cheap to animate)
      sj_glow.animate([{ opacity: 1 }, { opacity: 0.85, offset: 0.55 }, { opacity: 0 }], sj_timing),
    ];
    // Arrived: unroll.
    this.riseTimer = window.setTimeout(
      () => this.el.classList.remove('overlay--rolled'),
      ScrollPanel.UNROLL_AT_MS,
    );
    return true;
  }

  /** While rolled, the two rollers meet in the middle of the scroll (its height can change). */
  private roll(): void {
    if (!this.el.classList.contains('overlay--rolled')) return;
    const sj_scroll = this.el.querySelector<HTMLElement>('.scroll')!;
    const sj_paper = this.el.querySelector<HTMLElement>('.scroll__paper')!;
    sj_scroll.style.setProperty('--roll', `${Math.max(0, sj_paper.offsetHeight / 2)}px`);
  }

  /** Ends a rise at once: the scroll is where it rests, unrolled. */
  private land(): void {
    window.clearTimeout(this.riseTimer);
    for (const sj_a of this.flights) sj_a.cancel();
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
  step(sj_dir: 1 | -1): void {
    const sj_found = sj_SECTIONS.filter((sj_s) => this.progress.has(sj_s.id));
    if (!sj_found.length) return;
    const sj_i = sj_found.findIndex((sj_s) => sj_s.id === this.section);
    const sj_next = sj_found[(sj_i + sj_dir + sj_found.length) % sj_found.length]!;
    this.switchTo(sj_next.id);
  }

  private switchTo(sj_id: SectionId): void {
    this.section = sj_id;
    this.focus = undefined;
    this.render();
    this.emit('switch', sj_id);
  }

  private render(): void {
    const sj_meta = sectionMeta(this.section);
    this.glyph.textContent = sj_meta.glyph;
    // the section's character, large and faint in the paper, like a watermark
    this.sheet.dataset.glyph = sj_meta.glyph;
    this.title.textContent = sectionTitle(this.section, this.content);
    this.renderTabs();
    if (this.progress.has(this.section)) {
      this.body.innerHTML = renderSection(this.section, this.content, this.focus);
    } else {
      this.body.innerHTML = `<div class="locked">
        <span class="seal" aria-hidden="true">${sj_meta.glyph}</span>
        <p>This scroll is still hidden somewhere in the valley. Look for it at <strong>${esc(sj_meta.place)}</strong>.</p>
        <p><button type="button" class="btn btn--seal" data-travel="${sj_meta.id}">Travel there</button></p>
      </div>`;
    }
    this.body.scrollTop = 0;
    this.roll();
    const sj_focused = this.body.querySelector('.card--focus, .timeline--focus');
    if (sj_focused) window.setTimeout(() => scrollWithin(this.body, sj_focused, 'center'), 400);
  }

  private renderTabs(): void {
    this.tabs.innerHTML = sj_SECTIONS
      .map((sj_s) => {
        const sj_found = this.progress.has(sj_s.id);
        return `<button type="button" role="tab" class="tab${sj_found ? ' tab--found' : ''}" data-tab="${sj_s.id}"
        aria-selected="${sj_s.id === this.section}" title="${sj_found ? esc(sj_s.label) : `Not found yet: ${esc(sj_s.place)}`}">
        <i aria-hidden="true">${sj_s.glyph}</i><span>${esc(sj_s.label)}</span></button>`;
      })
      .join('');
    this.tabs
      .querySelectorAll<HTMLButtonElement>('[data-tab]')
      .forEach((sj_b) =>
        sj_b.addEventListener('click', () => this.switchTo(sj_b.dataset.tab as SectionId)),
      );
  }

  private onBodyClick(sj_e: MouseEvent): void {
    const sj_t = sj_e.target as HTMLElement;
    const sj_travel = sj_t.closest<HTMLElement>('[data-travel]');
    if (sj_travel && !this.film) {
      this.emit('travel', sj_travel.dataset.travel as SectionId);
      return;
    }
    const sj_project = sj_t.closest<HTMLElement>('[data-project]');
    if (sj_project) {
      this.focus = Number(sj_project.dataset.project);
      this.body.innerHTML = renderSection('projects', this.content, this.focus);
      this.emit('project', this.focus);
      return;
    }
    const sj_copy = sj_t.closest<HTMLElement>('[data-copy]');
    if (sj_copy) {
      const sj_text = sj_copy.dataset.copy ?? '';
      navigator.clipboard?.writeText(sj_text).then(
        () => (sj_copy.textContent = 'Copied!'),
        () => (sj_copy.textContent = sj_text),
      );
    }
  }
}
