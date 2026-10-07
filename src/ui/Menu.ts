import { Emitter } from '../core/Emitter';
import type { QualityLevel } from '../core/Quality';
import { releaseFocus, trapFocus } from './focus';
import { sj_ICONS } from './icons';
import { esc, safeUrl } from './render';

declare const __APP_VERSION__: string;

export type MenuEvents = {
  quality: QualityLevel;
  tour: void;
  classic: void;
  help: void;
  reset: void;
  close: void;
};

export interface MenuOptions {
  quality: QualityLevel;
  /** link to the source code, shown in the credits */
  sourceUrl?: string;
}

/** Settings and extras: quality preset, the plain page view, help, fullscreen, credits. */
export class Menu extends Emitter<MenuEvents> {
  readonly el: HTMLElement;
  isOpen = false;
  private quality: QualityLevel;

  constructor(sj_root: HTMLElement, sj_options: MenuOptions) {
    super();
    this.quality = sj_options.quality;
    this.el = document.createElement('div');
    this.el.className = 'overlay';
    const sj_version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
    const sj_canFullscreen = document.fullscreenEnabled === true;
    const sj_source = sj_options.sourceUrl
      ? ` <a href="${esc(safeUrl(sj_options.sourceUrl))}" target="_blank" rel="noopener noreferrer">Source code ↗</a>`
      : '';
    this.el.innerHTML = `
      <div class="menu" role="dialog" aria-modal="true" aria-labelledby="menu-title">
        <div class="menu__head">
          <h2 id="menu-title">Menu</h2>
          <button type="button" class="icon-btn" aria-label="Close menu (Esc)">${sj_ICONS.close}</button>
        </div>
        <h3>Graphics quality</h3>
        <div class="menu__row" role="group" aria-label="Graphics quality">
          ${(['low', 'medium', 'high'] as QualityLevel[])
            .map(
              (sj_q) =>
                `<button type="button" class="pill" data-quality="${sj_q}" aria-pressed="${sj_q === this.quality}">${sj_q[0]!.toUpperCase() + sj_q.slice(1)}</button>`,
            )
            .join('')}
        </div>
        <p class="menu__note">Lower it if the valley feels sluggish; it also saves battery.</p>
        <div class="menu__actions">
          <button type="button" class="btn btn--seal" data-act="tour">${sj_ICONS.film}Watch the tour</button>
          <button type="button" class="btn btn--ghost" data-act="classic">${sj_ICONS.book}Read as a page</button>
          <div class="menu__pair">
            <button type="button" class="btn btn--ghost" data-act="help">How to play</button>
            ${sj_canFullscreen ? '<button type="button" class="btn btn--ghost" data-act="fullscreen">Fullscreen</button>' : ''}
          </div>
          <button type="button" class="btn btn--ghost btn--quiet" data-act="reset">Hide all scrolls again</button>
        </div>
        <p class="menu__credits">
          Everything here (terrain, trees, the panda, the music) is generated in code with
          three.js, GLSL and the Web Audio API.${sj_source} <span class="menu__version">v${sj_version}</span>
        </p>
      </div>`;
    sj_root.appendChild(this.el);
    this.el.querySelector('.menu__head .icon-btn')!.addEventListener('click', () => this.close());
    this.el.addEventListener('pointerdown', (sj_e) => {
      if (sj_e.target === this.el) this.close();
    });
    this.el.querySelectorAll<HTMLButtonElement>('[data-quality]').forEach((sj_b) =>
      sj_b.addEventListener('click', () => {
        this.quality = sj_b.dataset.quality as QualityLevel;
        this.el
          .querySelectorAll<HTMLButtonElement>('[data-quality]')
          .forEach((sj_x) => sj_x.setAttribute('aria-pressed', String(sj_x === sj_b)));
        this.emit('quality', this.quality);
      }),
    );
    this.action('tour', () => {
      this.close();
      this.emit('tour', undefined);
    });
    this.action('classic', () => {
      this.close();
      this.emit('classic', undefined);
    });
    this.action('help', () => {
      this.close();
      this.emit('help', undefined);
    });
    this.action('reset', () => {
      this.emit('reset', undefined);
      this.close();
    });
    const sj_fullscreen = this.el.querySelector<HTMLButtonElement>('[data-act="fullscreen"]');
    if (sj_fullscreen) {
      sj_fullscreen.addEventListener('click', () => {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        else void document.documentElement.requestFullscreen().catch(() => undefined);
      });
      document.addEventListener('fullscreenchange', () => {
        sj_fullscreen.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
      });
    }
    trapFocus(this.el, () => this.isOpen);
  }

  /** Reflects a quality change made elsewhere (e.g. the adaptive monitor). */
  setQuality(sj_level: QualityLevel): void {
    this.quality = sj_level;
    this.el
      .querySelectorAll<HTMLButtonElement>('[data-quality]')
      .forEach((sj_x) =>
        sj_x.setAttribute('aria-pressed', String(sj_x.dataset.quality === sj_level)),
      );
  }

  private action(sj_name: string, sj_fn: () => void): void {
    this.el.querySelector(`[data-act="${sj_name}"]`)?.addEventListener('click', sj_fn);
  }

  open(): void {
    this.isOpen = true;
    this.el.classList.add('overlay--open');
    window.setTimeout(() => {
      if (this.isOpen) (this.el.querySelector('.menu__head .icon-btn') as HTMLElement)?.focus();
    }, 50);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('overlay--open');
    releaseFocus(this.el);
    this.emit('close', undefined);
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }
}
