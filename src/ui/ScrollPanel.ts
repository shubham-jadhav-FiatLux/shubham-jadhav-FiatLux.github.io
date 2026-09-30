import { Emitter } from '../core/Emitter';
import { SECTIONS, sectionMeta, type SectionId } from '../content/sections';
import type { PortfolioContent } from '../content/types';
import type { Progress } from '../zones/Progress';
import { releaseFocus, trapFocus } from './focus';
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
    trapFocus(this.el, () => this.isOpen);
    progress.on('discover', () => this.isOpen && this.renderTabs());
  }

  open(section: SectionId, focus?: number): void {
    this.section = section;
    this.focus = focus;
    this.render();
    if (!this.isOpen) {
      this.isOpen = true;
      this.el.classList.add('overlay--open');
      window.setTimeout(() => {
        if (this.isOpen) (this.el.querySelector('.scroll__close') as HTMLElement)?.focus();
      }, 60);
    }
    this.emit('open', section);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
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
    const focused = this.body.querySelector('.card--focus, .timeline--focus');
    if (focused)
      window.setTimeout(() => focused.scrollIntoView({ block: 'center', behavior: 'smooth' }), 400);
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
    if (travel) {
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
