import { Emitter } from '../core/Emitter';
import type { QualityLevel } from '../core/Quality';
import { ICONS } from './icons';

declare const __APP_VERSION__: string;

export type MenuEvents = {
  quality: QualityLevel;
  classic: void;
  reset: void;
  close: void;
};

/** Settings and extras: quality preset, the plain page view, progress reset, credits. */
export class Menu extends Emitter<MenuEvents> {
  readonly el: HTMLElement;
  isOpen = false;

  constructor(
    root: HTMLElement,
    private quality: QualityLevel,
  ) {
    super();
    this.el = document.createElement('div');
    this.el.className = 'overlay';
    const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
    this.el.innerHTML = `
      <div class="menu" role="dialog" aria-modal="true" aria-labelledby="menu-title">
        <div class="menu__head">
          <h2 id="menu-title">Menu</h2>
          <button type="button" class="icon-btn" aria-label="Close menu (Esc)">${ICONS.close}</button>
        </div>
        <h3>Graphics quality</h3>
        <div class="menu__row" role="group" aria-label="Graphics quality">
          ${(['low', 'medium', 'high'] as QualityLevel[])
            .map(
              (q) =>
                `<button type="button" class="pill" data-quality="${q}" aria-pressed="${q === quality}">${q[0]!.toUpperCase() + q.slice(1)}</button>`,
            )
            .join('')}
        </div>
        <div class="menu__actions">
          <button type="button" class="btn btn--seal" data-act="classic">${ICONS.book} Read as a page</button>
          <button type="button" class="btn btn--ghost" data-act="reset">Hide all scrolls again</button>
        </div>
        <p class="menu__credits">
          Everything here — terrain, trees, the panda, the music — is generated in code with
          three.js, GLSL and the Web Audio API. <span class="menu__version">v${version}</span>
        </p>
      </div>`;
    root.appendChild(this.el);
    this.el.querySelector('.menu__head .icon-btn')!.addEventListener('click', () => this.close());
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) this.close();
    });
    this.el.querySelectorAll<HTMLButtonElement>('[data-quality]').forEach((b) =>
      b.addEventListener('click', () => {
        this.quality = b.dataset.quality as QualityLevel;
        this.el
          .querySelectorAll<HTMLButtonElement>('[data-quality]')
          .forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        this.emit('quality', this.quality);
      }),
    );
    this.el.querySelector('[data-act="classic"]')!.addEventListener('click', () => {
      this.close();
      this.emit('classic', undefined);
    });
    this.el.querySelector('[data-act="reset"]')!.addEventListener('click', () => {
      this.emit('reset', undefined);
      this.close();
    });
  }

  open(): void {
    this.isOpen = true;
    this.el.classList.add('overlay--open');
    window.setTimeout(
      () => (this.el.querySelector('.menu__head .icon-btn') as HTMLElement)?.focus(),
      50,
    );
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('overlay--open');
    this.emit('close', undefined);
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }
}
