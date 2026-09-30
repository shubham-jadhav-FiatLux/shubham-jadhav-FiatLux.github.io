import { Emitter } from '../core/Emitter';
import { SECTIONS, sectionMeta, type SectionId } from '../content/sections';
import type { PortfolioContent } from '../content/types';
import type { Progress } from '../zones/Progress';
import { ICONS } from './icons';
import { esc } from './render';

export type HudEvents = {
  map: void;
  sound: void;
  music: void;
  menu: void;
  prompt: void;
  seal: SectionId;
};

/**
 * Heads-up display: title, buttons (map, sound, music, menu), the interaction prompt,
 * scroll progress seals, a controls hint that fades once the visitor moves, and toasts.
 */
export class Hud extends Emitter<HudEvents> {
  readonly el: HTMLElement;
  private prompt: HTMLButtonElement;
  private promptKey: HTMLElement;
  private promptText: HTMLElement;
  private seals = new Map<SectionId, HTMLButtonElement>();
  private count: HTMLElement;
  private hints: HTMLElement;
  private toasts: HTMLElement;
  private soundBtn: HTMLButtonElement;
  private musicBtn: HTMLButtonElement;

  constructor(
    root: HTMLElement,
    content: PortfolioContent,
    private readonly progress: Progress,
  ) {
    super();
    const named = !content.owner.name.includes('[');
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="hud__brand">
        <span class="seal" aria-hidden="true">竹</span>
        <div><span class="hud__title">${esc(content.site.title)}</span>
        ${named ? `<span class="hud__owner">${esc(content.owner.name)}</span>` : ''}</div>
      </div>
      <nav class="hud__buttons" aria-label="Game controls">
        <button type="button" class="icon-btn" data-act="map" aria-label="Open map (M)" title="Map (M)">${ICONS.map}</button>
        <button type="button" class="icon-btn" data-act="sound" aria-label="Sound" aria-pressed="true" title="Sound (N)">${ICONS.soundOn}</button>
        <button type="button" class="icon-btn" data-act="music" aria-label="Music" aria-pressed="true" title="Music">${ICONS.music}</button>
        <button type="button" class="icon-btn" data-act="menu" aria-label="Menu" title="Menu">${ICONS.menu}</button>
      </nav>
      <div class="toasts" aria-live="polite"></div>
      <button type="button" class="hud__prompt" aria-live="polite"><kbd>E</kbd><span></span></button>
      <div class="hud__progress">
        <div class="hud__seals"></div>
        <span class="hud__count"></span>
      </div>
      <div class="hud__hints" aria-hidden="true">
        <span><kbd>WASD</kbd>walk</span><span><kbd>Shift</kbd>run</span><span><kbd>Space</kbd>jump</span>
        <span><kbd>F</kbd>strike</span><span><kbd>E</kbd>read</span><span><kbd>M</kbd>map</span>
      </div>`;
    root.appendChild(this.el);
    this.prompt = this.el.querySelector('.hud__prompt')!;
    this.promptKey = this.prompt.querySelector('kbd')!;
    this.promptText = this.prompt.querySelector('span')!;
    this.count = this.el.querySelector('.hud__count')!;
    this.hints = this.el.querySelector('.hud__hints')!;
    this.toasts = this.el.querySelector('.toasts')!;
    this.soundBtn = this.el.querySelector('[data-act="sound"]')!;
    this.musicBtn = this.el.querySelector('[data-act="music"]')!;
    const sealsEl = this.el.querySelector('.hud__seals')!;
    for (const s of SECTIONS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hud__seal';
      b.textContent = s.glyph;
      b.addEventListener('click', () => this.emit('seal', s.id));
      sealsEl.appendChild(b);
      this.seals.set(s.id, b);
    }
    this.el.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) =>
      b.addEventListener('click', () => {
        this.emit(b.dataset.act as 'map' | 'sound' | 'music' | 'menu', undefined);
        b.blur();
      }),
    );
    this.prompt.addEventListener('click', () => this.emit('prompt', undefined));
    this.refreshProgress();
    progress.on('discover', (id) => {
      this.refreshProgress();
      const seal = this.seals.get(id);
      seal?.classList.remove('hud__seal--stamp');
      void seal?.offsetWidth;
      seal?.classList.add('hud__seal--stamp');
    });
    progress.on('reset', () => this.refreshProgress());
  }

  show(): void {
    this.el.classList.add('hud--visible');
  }

  private refreshProgress(): void {
    for (const s of SECTIONS) {
      const b = this.seals.get(s.id)!;
      const found = this.progress.has(s.id);
      b.classList.toggle('hud__seal--found', found);
      b.setAttribute(
        'aria-label',
        found ? `${s.label}: found. Open scroll` : `${s.label}: not found yet (${s.place})`,
      );
      b.title = found ? s.label : `Find it at ${s.place}`;
    }
    this.count.textContent = `${this.progress.count} / ${this.progress.total} scrolls`;
  }

  setPrompt(text: string | null, key: 'E' | 'F' = 'E', touch = false): void {
    if (text) {
      this.promptKey.textContent = touch ? '👆' : key;
      this.promptText.textContent = text;
    }
    this.prompt.classList.toggle('hud__prompt--visible', !!text);
  }

  setSound(on: boolean): void {
    this.soundBtn.setAttribute('aria-pressed', String(on));
    this.soundBtn.innerHTML = on ? ICONS.soundOn : ICONS.soundOff;
  }

  setMusic(on: boolean): void {
    this.musicBtn.setAttribute('aria-pressed', String(on));
  }

  fadeHints(): void {
    this.hints.classList.add('hud__hints--faded');
  }

  toast(text: string): void {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    this.toasts.appendChild(t);
    window.setTimeout(() => t.remove(), 3800);
  }

  /** Big seal stamped in the middle of the screen for a new discovery. */
  stamp(id: SectionId): void {
    const meta = sectionMeta(id);
    const el = document.createElement('div');
    el.className = 'discovery';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<div class="discovery__splash"></div><div class="seal discovery__seal">${meta.glyph}</div>
      <div class="discovery__label">${esc(meta.label)}</div>`;
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 1700);
  }
}
