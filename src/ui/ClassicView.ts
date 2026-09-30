import type { PortfolioContent } from '../content/types';
import { classicHtml } from './classicHtml';

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
    root: HTMLElement,
    content: PortfolioContent,
    private readonly canPlay: boolean,
    private readonly behind: HTMLElement[] = [],
  ) {
    this.el = document.createElement('div');
    this.el.className = 'classic';
    this.el.setAttribute('role', 'document');
    this.el.hidden = true;
    this.el.innerHTML = classicHtml(content, { canPlay });
    root.appendChild(this.el);
    this.el.querySelector('.classic__play')?.addEventListener('click', () => this.close());
    this.el.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#classic-"]');
      if (!a) return;
      e.preventDefault();
      this.el.querySelector(a.getAttribute('href')!)?.scrollIntoView({ behavior: 'smooth' });
    });
    // On the document (it bubbles before window), so the game never also reads this
    // Escape as "open the menu".
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !this.isOpen || !this.canPlay) return;
      e.stopPropagation();
      this.close();
    });
  }

  open(onClose?: () => void): void {
    this.onClose = onClose ?? null;
    this.isOpen = true;
    this.el.hidden = false;
    for (const el of this.behind) el.inert = true;
    this.el.scrollTop = 0;
    (this.el.querySelector('h1') as HTMLElement | null)?.setAttribute('tabindex', '-1');
    (this.el.querySelector('h1') as HTMLElement | null)?.focus();
  }

  close(): void {
    if (!this.isOpen || !this.canPlay) return;
    this.isOpen = false;
    this.el.hidden = true;
    for (const el of this.behind) el.inert = false;
    this.onClose?.();
  }
}
