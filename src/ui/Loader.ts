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
  private tourBtn: HTMLButtonElement;
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
    this.tourBtn = el.querySelector('.loader__tour')!;
    el.querySelector('.loader__title')!.textContent = content.site.title;
    el.querySelector('.loader__tagline')!.textContent = content.site.tagline;
    if (window.matchMedia?.('(pointer: coarse)').matches) {
      this.hint.textContent = 'Sound on · Joystick to walk · Headphones recommended';
    }
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

  /**
   * Reveal the valley and wait for the visitor to begin, walking (`onBegin(false)`) or
   * watching the tour (`onBegin(true)`). `canBegin` lets the page veto the Enter/Space
   * shortcut, e.g. while the page view is open on top of the loader. With `preferTour`
   * (a link ending in ?tour) the tour is the main button.
   */
  ready(
    onBegin: (tour: boolean) => void,
    canBegin: () => boolean = () => true,
    preferTour = false,
  ): void {
    this.el.classList.add('loader--ready');
    this.beginBtn.hidden = false;
    this.tourBtn.hidden = false;
    this.hint.hidden = false;
    if (preferTour) {
      this.beginBtn.classList.replace('btn--seal', 'btn--ghost');
      this.tourBtn.classList.replace('btn--ghost', 'btn--seal');
      this.beginBtn.parentElement!.insertBefore(this.tourBtn, this.beginBtn);
    }
    const main = preferTour ? this.tourBtn : this.beginBtn;
    main.focus({ preventScroll: true });
    const begin = (tour: boolean) => {
      if (this.begun) return;
      this.begun = true;
      window.removeEventListener('keydown', onKey);
      (document.activeElement as HTMLElement | null)?.blur?.();
      this.el.classList.add('loader--leaving');
      window.setTimeout(() => this.el.remove(), 1400);
      onBegin(tour);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!canBegin()) return;
      // Buttons handle their own Enter/Space; elsewhere the main choice starts.
      if (e.target instanceof HTMLButtonElement) return;
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        begin(preferTour);
      }
    };
    this.beginBtn.addEventListener('click', () => begin(false));
    this.tourBtn.addEventListener('click', () => begin(true));
    window.addEventListener('keydown', onKey);
  }

  showError(message: string): void {
    this.el.classList.add('loader--error');
    this.status.textContent = message;
  }
}
