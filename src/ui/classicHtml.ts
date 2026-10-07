import { sj_SECTIONS } from '../content/sections';
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
export function classicHtml(sj_content: PortfolioContent, sj_o: ClassicHtmlOptions): string {
  const sj_named = !sj_content.owner.name.includes('[');
  const sj_sections = sj_SECTIONS.filter((sj_s) => sj_s.id !== 'welcome');
  return `
    <header class="classic__hero">
      <span class="seal seal--lg" aria-hidden="true">${esc(sj_content.site.seal)}</span>
      <h1>${esc(sj_named ? sj_content.owner.name : sj_content.site.title)}</h1>
      <p class="classic__role">${esc(sj_content.owner.role)}</p>
      <p class="classic__intro">${esc(sj_content.owner.intro)}</p>
      ${sj_o.note ? `<p class="classic__note">${esc(sj_o.note)}</p>` : ''}
      <nav class="classic__nav" aria-label="Sections">
        ${sj_sections.map((sj_s) => `<a href="#classic-${sj_s.id}">${esc(sj_s.label)}</a>`).join('')}
      </nav>
      ${sj_o.canPlay ? '<button type="button" class="btn btn--seal classic__play">Walk the valley instead</button>' : ''}
    </header>
    <main class="classic__main prose">
      ${sj_sections
        .map(
          (
            sj_s,
          ) => `<section id="classic-${sj_s.id}" class="classic__section" aria-labelledby="classic-${sj_s.id}-h">
            <h2 id="classic-${sj_s.id}-h"><span class="seal" aria-hidden="true">${sj_s.glyph}</span>${esc(sectionTitle(sj_s.id, sj_content))}</h2>
            ${renderSection(sj_s.id, sj_content)}
          </section>`,
        )
        .join('')}
    </main>
    <footer class="classic__foot">
      <p>${esc(sj_content.site.title)} · ${esc(sj_content.site.tagline)}</p>
    </footer>`;
}
