import { SECTIONS } from '../content/sections';
import type { PortfolioContent } from '../content/types';
import { esc, renderSection, sectionTitle } from './render';

export interface ClassicHtmlOptions {
  /** show the "walk the valley instead" button */
  canPlay: boolean;
  /** optional line under the intro (e.g. why the 3D view is unavailable) */
  note?: string;
}

/**
 * The whole portfolio as plain, semantic HTML. Pure string building with no DOM access, so
 * the same markup serves the in-game page view and the build-time `<noscript>` copy that
 * search engines, link unfurlers and visitors without JavaScript see.
 */
export function classicHtml(content: PortfolioContent, o: ClassicHtmlOptions): string {
  const named = !content.owner.name.includes('[');
  const sections = SECTIONS.filter((s) => s.id !== 'welcome');
  return `
    <header class="classic__hero">
      <span class="seal seal--lg" aria-hidden="true">${esc(content.site.seal)}</span>
      <h1>${esc(named ? content.owner.name : content.site.title)}</h1>
      <p class="classic__role">${esc(content.owner.role)}</p>
      <p class="classic__intro">${esc(content.owner.intro)}</p>
      ${o.note ? `<p class="classic__note">${esc(o.note)}</p>` : ''}
      <nav class="classic__nav" aria-label="Sections">
        ${sections.map((s) => `<a href="#classic-${s.id}">${esc(s.label)}</a>`).join('')}
      </nav>
      ${o.canPlay ? '<button type="button" class="btn btn--seal classic__play">Walk the valley instead</button>' : ''}
    </header>
    <main class="classic__main prose">
      ${sections
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
}
