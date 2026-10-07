import { Emitter } from '../core/Emitter';
import { sj_SECTIONS, sectionMeta, type SectionId } from '../content/sections';
import type { PortfolioContent } from '../content/types';
import type { Progress } from '../zones/Progress';
import { sj_ICONS } from './icons';
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
  private touring = false;

  constructor(
    sj_root: HTMLElement,
    sj_content: PortfolioContent,
    private readonly progress: Progress,
  ) {
    super();
    const sj_named = !sj_content.owner.name.includes('[');
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="hud__brand">
        <span class="seal" aria-hidden="true">${esc(sj_content.site.seal)}</span>
        <div><span class="hud__title">${esc(sj_content.site.title)}</span>
        ${sj_named ? `<span class="hud__owner">${esc(sj_content.owner.name)}</span>` : ''}</div>
      </div>
      <nav class="hud__buttons" aria-label="Game controls">
        <button type="button" class="icon-btn" data-act="map" aria-label="Open map (M)" title="Map (M)">${sj_ICONS.map}</button>
        <button type="button" class="icon-btn" data-act="sound" aria-label="Sound" aria-pressed="true" title="Sound (N)">${sj_ICONS.soundOn}</button>
        <button type="button" class="icon-btn" data-act="music" aria-label="Music" aria-pressed="true" title="Music">${sj_ICONS.music}</button>
        <button type="button" class="icon-btn" data-act="menu" aria-label="Menu" title="Menu">${sj_ICONS.menu}</button>
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
    sj_root.appendChild(this.el);
    this.prompt = this.el.querySelector('.hud__prompt')!;
    this.promptKey = this.prompt.querySelector('kbd')!;
    this.promptText = this.prompt.querySelector('span')!;
    this.count = this.el.querySelector('.hud__count')!;
    this.hints = this.el.querySelector('.hud__hints')!;
    this.toasts = this.el.querySelector('.toasts')!;
    this.soundBtn = this.el.querySelector('[data-act="sound"]')!;
    this.musicBtn = this.el.querySelector('[data-act="music"]')!;
    const sj_sealsEl = this.el.querySelector('.hud__seals')!;
    for (const sj_s of sj_SECTIONS) {
      const sj_b = document.createElement('button');
      sj_b.type = 'button';
      sj_b.className = 'hud__seal';
      sj_b.textContent = sj_s.glyph;
      sj_b.addEventListener('click', () => this.emit('seal', sj_s.id));
      sj_sealsEl.appendChild(sj_b);
      this.seals.set(sj_s.id, sj_b);
    }
    this.el.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((sj_b) =>
      sj_b.addEventListener('click', () => {
        this.emit(sj_b.dataset.act as 'map' | 'sound' | 'music' | 'menu', undefined);
        sj_b.blur();
      }),
    );
    this.prompt.addEventListener('click', () => {
      this.emit('prompt', undefined);
      this.prompt.blur(); // so Space goes back to jumping once the prompt fades
    });
    this.refreshProgress();
    progress.on('discover', (sj_id) => {
      this.refreshProgress();
      const sj_seal = this.seals.get(sj_id);
      sj_seal?.classList.remove('hud__seal--stamp');
      void sj_seal?.offsetWidth;
      sj_seal?.classList.add('hud__seal--stamp');
    });
    progress.on('reset', () => this.refreshProgress());
  }

  show(): void {
    this.el.classList.add('hud--visible');
  }

  /** The tour draws its own frame: the HUD steps aside (and keeps its toasts). */
  setTouring(sj_on: boolean): void {
    this.touring = sj_on;
    this.el.classList.toggle('hud--touring', sj_on);
  }

  private refreshProgress(): void {
    for (const sj_s of sj_SECTIONS) {
      const sj_b = this.seals.get(sj_s.id)!;
      const sj_found = this.progress.has(sj_s.id);
      sj_b.classList.toggle('hud__seal--found', sj_found);
      sj_b.setAttribute(
        'aria-label',
        sj_found
          ? `${sj_s.label}: found. Open scroll`
          : `${sj_s.label}: not found yet (${sj_s.place})`,
      );
      sj_b.title = sj_found ? sj_s.label : `Find it at ${sj_s.place}`;
    }
    this.count.textContent = `${this.progress.count} / ${this.progress.total} scrolls`;
  }

  setPrompt(sj_text: string | null, sj_key: 'E' | 'F' = 'E', sj_touch = false): void {
    if (sj_text) {
      this.promptKey.textContent = sj_touch ? '👆' : sj_key;
      this.promptText.textContent = sj_text;
    }
    this.prompt.classList.toggle('hud__prompt--visible', !!sj_text);
  }

  setSound(sj_on: boolean): void {
    this.soundBtn.setAttribute('aria-pressed', String(sj_on));
    this.soundBtn.innerHTML = sj_on ? sj_ICONS.soundOn : sj_ICONS.soundOff;
  }

  setMusic(sj_on: boolean): void {
    this.musicBtn.setAttribute('aria-pressed', String(sj_on));
  }

  fadeHints(): void {
    this.hints.classList.add('hud__hints--faded');
  }

  /** A short message; during the tour only when `sj_force` is set. */
  toast(sj_text: string, sj_force = false): void {
    if (this.touring && !sj_force) return;
    const sj_t = document.createElement('div');
    sj_t.className = 'toast';
    sj_t.textContent = sj_text;
    this.toasts.appendChild(sj_t);
    window.setTimeout(() => sj_t.remove(), 3800);
  }

  /** Big seal stamped in the middle of the screen for a new discovery. */
  stamp(sj_id: SectionId): void {
    const sj_meta = sectionMeta(sj_id);
    const sj_el = document.createElement('div');
    sj_el.className = 'discovery';
    sj_el.setAttribute('aria-hidden', 'true');
    sj_el.innerHTML = `<div class="discovery__splash"></div><div class="seal discovery__seal">${sj_meta.glyph}</div>
      <div class="discovery__label">${esc(sj_meta.label)}</div>`;
    document.body.appendChild(sj_el);
    window.setTimeout(() => sj_el.remove(), 1700);
  }
}
