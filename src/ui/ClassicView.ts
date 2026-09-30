import { SECTIONS } from '../content/sections';
import type { PortfolioContent } from '../content/types';
import { esc, renderSection, sectionTitle } from './render';

/**
 * The whole portfolio as a plain, accessible web page: for recruiters in a hurry,
 * screen readers, search engines and browsers without WebGL 2.
 */
export class ClassicView {
  readonly el: HTMLElement;
  isOpen = false;
  private onClose: (() => void) | null = null;

  constructor(
    root: HTMLElement,
    content: PortfolioContent,
    private readonly canPlay: boolean,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'classic';
    this.el.setAttribute('role', 'document');
    this.el.hidden = true;
    const named = !content.owner.name.includes('[');
    this.el.innerHTML = `
      <header class="classic__hero">
        <span class="seal seal--lg" aria-hidden="true">竹</span>
        <h1>${esc(named ? content.owner.name : content.site.title)}</h1>
        <p class="classic__role">${esc(content.owner.role)}</p>
        <p class="classic__intro">${esc(content.owner.intro)}</p>
        <nav class="classic__nav" aria-label="Sections">
          ${SECTIONS.filter((s) => s.id !== 'welcome')
            .map((s) => `<a href="#classic-${s.id}">${esc(s.label)}</a>`)
            .join('')}
        </nav>
        ${canPlay ? '<button type="button" class="btn btn--seal classic__play">Walk the valley instead</button>' : ''}
      </header>
      <main class="classic__main prose">
        ${SECTIONS.filter((s) => s.id !== 'welcome')
          .map(
            (
              s,
            ) => `<section id="classic-${s.id}" class="classic__section" aria-labelledby="classic-${s.id}-h">
              <h2 id="classic-${s.id}-h"><span class="seal" aria-hidden="true">${s.glyph}</span>${esc(sectionTitle(s.id, content))}</h2>
              ${renderSection(s.id, content)}
            </section>`,
          )
          .join('')}
      </main>
      <footer class="classic__foot">
        <p>${esc(content.site.title)} · ${esc(content.site.tagline)}</p>
      </footer>`;
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
    this.el.scrollTop = 0;
    (this.el.querySelector('h1') as HTMLElement | null)?.setAttribute('tabindex', '-1');
    (this.el.querySelector('h1') as HTMLElement | null)?.focus();
  }

  close(): void {
    if (!this.isOpen || !this.canPlay) return;
    this.isOpen = false;
    this.el.hidden = true;
    this.onClose?.();
  }
}
