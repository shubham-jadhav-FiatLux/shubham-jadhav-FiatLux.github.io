import type { PortfolioContent } from '../content/types';

/**
 * Title screen: shows build progress, then invites the visitor in. While it is up the
 * valley orbits behind the translucent paper.
 */
export class Loader {
  private brush: HTMLElement;
  private status: HTMLElement;
  private beginBtn: HTMLButtonElement;
  private hint: HTMLElement;
  private classicBtn: HTMLButtonElement;
  private begun = false;

  constructor(
    private readonly el: HTMLElement,
    content: PortfolioContent,
  ) {
    this.brush = el.querySelector('.loader__brush')!;
    this.status = el.querySelector('.loader__status')!;
    this.beginBtn = el.querySelector('.loader__begin')!;
    this.hint = el.querySelector('.loader__hint')!;
    this.classicBtn = el.querySelector('.loader__classic')!;
    el.querySelector('.loader__title')!.textContent = content.site.title;
    el.querySelector('.loader__tagline')!.textContent = content.site.tagline;
    const owner = el.querySelector('.loader__owner')!;
    owner.textContent = content.owner.name.includes('[')
      ? ''
      : `${content.owner.name} · ${content.owner.role}`;
  }

  onClassic(fn: () => void): void {
    this.classicBtn.addEventListener('click', fn);
  }

  setProgress(fraction: number, label: string): void {
    this.brush.style.width = `${Math.round(Math.max(0.04, fraction) * 100)}%`;
    this.status.textContent = `${label}…`;
  }

  /** Reveal the valley and wait for the visitor to begin. */
  ready(onBegin: () => void): void {
    this.el.classList.add('loader--ready');
    this.beginBtn.hidden = false;
    this.hint.hidden = false;
    this.beginBtn.focus({ preventScroll: true });
    const begin = () => {
      if (this.begun) return;
      this.begun = true;
      window.removeEventListener('keydown', onKey);
      this.beginBtn.blur();
      this.el.classList.add('loader--leaving');
      window.setTimeout(() => this.el.remove(), 1400);
      onBegin();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        begin();
      }
    };
    this.beginBtn.addEventListener('click', begin);
    window.addEventListener('keydown', onKey);
  }

  showError(message: string): void {
    this.el.classList.add('loader--error');
    this.status.textContent = message;
  }
}
