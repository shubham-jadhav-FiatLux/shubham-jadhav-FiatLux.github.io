import type { PortfolioContent } from '../content/types';
import { classicHtml } from './classicHtml';
import { scrollWithin } from './scrolling';

/**
 * The whole portfolio as a plain, accessible web page: for recruiters in a hurry,
 * screen readers, search engines and browsers without WebGL 2.
 */
export class ClassicView {
  readonly el: HTMLElement;
  isOpen = false;
  private onClose: (() => void) | null = null;

  /**
   * @param behind elements covered by the page view; they are made inert while it is open
   *   so keyboard and screen reader users stay on the page.
   */
  constructor(
    sj_root: HTMLElement,
    sj_content: PortfolioContent,
    private readonly canPlay: boolean,
    private readonly behind: HTMLElement[] = [],
  ) {
    this.el = document.createElement('div');
    this.el.className = 'classic';
    this.el.setAttribute('role', 'document');
    this.el.hidden = true;
    this.el.innerHTML = classicHtml(sj_content, { canPlay });
    sj_root.appendChild(this.el);
    this.el.querySelector('.classic__play')?.addEventListener('click', () => this.close());
    this.el.addEventListener('click', (sj_e) => {
      const sj_a = (sj_e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#classic-"]');
      if (!sj_a) return;
      sj_e.preventDefault();
      const sj_target = this.el.querySelector(sj_a.getAttribute('href')!);
      if (sj_target) scrollWithin(this.el, sj_target, 'start', 16);
    });
    // On the document (it bubbles before window), so the game never also reads this
    // Escape as "open the menu".
    document.addEventListener('keydown', (sj_e) => {
      if (sj_e.key !== 'Escape' || !this.isOpen || !this.canPlay) return;
      sj_e.stopPropagation();
      this.close();
    });
  }

  open(sj_onClose?: () => void): void {
    this.onClose = sj_onClose ?? null;
    this.isOpen = true;
    this.el.hidden = false;
    for (const sj_el of this.behind) sj_el.inert = true;
    this.el.scrollTop = 0;
    (this.el.querySelector('h1') as HTMLElement | null)?.setAttribute('tabindex', '-1');
    (this.el.querySelector('h1') as HTMLElement | null)?.focus();
  }

  close(): void {
    if (!this.isOpen || !this.canPlay) return;
    this.isOpen = false;
    this.el.hidden = true;
    for (const sj_el of this.behind) sj_el.inert = false;
    this.onClose?.();
  }
}
