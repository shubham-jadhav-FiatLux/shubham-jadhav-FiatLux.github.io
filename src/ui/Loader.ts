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
    sj_content: PortfolioContent,
  ) {
    this.brush = el.querySelector('.loader__brush')!;
    this.status = el.querySelector('.loader__status')!;
    this.beginBtn = el.querySelector('.loader__begin')!;
    this.hint = el.querySelector('.loader__hint')!;
    this.classicBtn = el.querySelector('.loader__classic')!;
    this.tourBtn = el.querySelector('.loader__tour')!;
    el.querySelector('.loader__title')!.textContent = sj_content.site.title;
    const sj_seal = el.querySelector('.loader__seal');
    if (sj_seal) sj_seal.textContent = sj_content.site.seal;
    el.querySelector('.loader__tagline')!.textContent = sj_content.site.tagline;
    if (window.matchMedia?.('(pointer: coarse)').matches) {
      this.hint.textContent = 'Sound on · Joystick to walk · Headphones recommended';
    }
    const sj_owner = el.querySelector('.loader__owner')!;
    sj_owner.textContent = sj_content.owner.name.includes('[')
      ? ''
      : `${sj_content.owner.name} · ${sj_content.owner.role}`;
  }

  onClassic(sj_fn: () => void): void {
    this.classicBtn.addEventListener('click', sj_fn);
  }

  setProgress(sj_fraction: number, sj_label: string): void {
    this.brush.style.width = `${Math.round(Math.max(0.04, sj_fraction) * 100)}%`;
    this.status.textContent = `${sj_label}…`;
  }

  /**
   * Reveal the valley and wait for the visitor to begin, walking (`onBegin(false)`) or
   * watching the tour (`onBegin(true)`). `sj_canBegin` lets the page veto the Enter/Space
   * shortcut, e.g. while the page view is open on top of the loader. With `sj_preferTour`
   * (a link ending in ?tour) the tour is the main button.
   */
  ready(
    sj_onBegin: (sj_tour: boolean) => void,
    sj_canBegin: () => boolean = () => true,
    sj_preferTour = false,
  ): void {
    this.el.classList.add('loader--ready');
    this.beginBtn.hidden = false;
    this.tourBtn.hidden = false;
    this.hint.hidden = false;
    if (sj_preferTour) {
      this.beginBtn.classList.replace('btn--seal', 'btn--ghost');
      this.tourBtn.classList.replace('btn--ghost', 'btn--seal');
      this.beginBtn.parentElement!.insertBefore(this.tourBtn, this.beginBtn);
    }
    const sj_main = sj_preferTour ? this.tourBtn : this.beginBtn;
    sj_main.focus({ preventScroll: true });
    const sj_begin = (sj_tour: boolean) => {
      if (this.begun) return;
      this.begun = true;
      window.removeEventListener('keydown', sj_onKey);
      (document.activeElement as HTMLElement | null)?.blur?.();
      this.el.classList.add('loader--leaving');
      window.setTimeout(() => this.el.remove(), 1400);
      sj_onBegin(sj_tour);
    };
    const sj_onKey = (sj_e: KeyboardEvent) => {
      if (!sj_canBegin()) return;
      // Buttons handle their own Enter/Space; elsewhere the main choice starts.
      if (sj_e.target instanceof HTMLButtonElement) return;
      if (sj_e.code === 'Enter' || sj_e.code === 'Space') {
        sj_e.preventDefault();
        sj_begin(sj_preferTour);
      }
    };
    this.beginBtn.addEventListener('click', () => sj_begin(false));
    this.tourBtn.addEventListener('click', () => sj_begin(true));
    window.addEventListener('keydown', sj_onKey);
  }

  showError(sj_message: string): void {
    this.el.classList.add('loader--error');
    this.status.textContent = sj_message;
  }
}
