import type { PortfolioContent, Project } from '../content/types';
import { sectionMeta, type SectionId } from '../content/sections';

/** Escapes text for safe interpolation into HTML. */
export function esc(sj_value: unknown): string {
  return String(sj_value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only allow http(s), mailto and relative links. */
export function safeUrl(sj_url: string): string {
  const sj_u = sj_url.trim();
  if (/^(https?:|mailto:|\/|\.\/|#)/i.test(sj_u)) return sj_u;
  return '#';
}

function link(sj_label: string, sj_url: string, sj_cls = 'chip-link'): string {
  const sj_external = /^https?:/i.test(sj_url);
  return `<a class="${sj_cls}" href="${esc(safeUrl(sj_url))}"${sj_external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(sj_label)}${sj_external ? '<span aria-hidden="true"> ↗</span>' : ''}</a>`;
}

function paragraphs(sj_list: string[] | undefined): string {
  return (sj_list ?? []).map((sj_p) => `<p>${esc(sj_p)}</p>`).join('');
}

function levelSeals(sj_level = 0): string {
  const sj_n = Math.max(0, Math.min(5, Math.round(sj_level)));
  const sj_seals = Array.from(
    { length: 5 },
    (_sj, sj_i) => `<i class="lvl${sj_i < sj_n ? ' lvl--on' : ''}"></i>`,
  ).join('');
  return `<span class="levels" role="img" aria-label="${sj_n} out of 5">${sj_seals}</span>`;
}

export const sj_CONTROLS: [string, string][] = [
  ['WASD / arrows', 'Walk'],
  ['Shift', 'Run'],
  ['Space', 'Jump'],
  ['F', 'Kung-fu strike'],
  ['E / Enter', 'Read a scroll, ring the bell'],
  ['M', 'Map and quick travel'],
  ['N', 'Mute sound'],
  ['H', 'This help'],
  ['Esc', 'Close / menu'],
  ['Drag / wheel', 'Look around / zoom'],
];

export const sj_TOUCH_CONTROLS: [string, string][] = [
  ['Left thumb', 'Joystick: walk, push fully to run'],
  ['Right side', 'Drag to look around'],
  ['⤒', 'Jump'],
  ['拳', 'Kung-fu strike'],
  ['E', 'Read a scroll, ring the bell'],
  ['Map button', 'Map and quick travel'],
];

function controlList(sj_list: [string, string][], sj_cls: string): string {
  return `<dl class="controls ${sj_cls}">${sj_list.map(([sj_k, sj_v]) => `<div><dt>${esc(sj_k)}</dt><dd>${esc(sj_v)}</dd></div>`).join('')}</dl>`;
}

function renderWelcome(sj_c: PortfolioContent): string {
  return `${paragraphs(sj_c.welcome.paragraphs)}
  <h3 class="sub">How to play</h3>
  ${controlList(sj_CONTROLS, 'controls--keys')}${controlList(sj_TOUCH_CONTROLS, 'controls--touch')}
  <p class="muted controls--keys-note">A gamepad works too: left stick to walk, A to jump, X to strike, Y to read.</p>`;
}

function renderAbout(sj_c: PortfolioContent): string {
  const sj_facts = sj_c.about.facts?.length
    ? `<dl class="facts">${sj_c.about.facts.map((sj_f) => `<div><dt>${esc(sj_f.label)}</dt><dd>${esc(sj_f.value)}</dd></div>`).join('')}</dl>`
    : '';
  const sj_resume = sj_c.owner.resumeUrl
    ? `<p>${link('Download my résumé', sj_c.owner.resumeUrl, 'btn-link')}</p>`
    : '';
  return `<p class="lead"><strong>${esc(sj_c.owner.name)}</strong> · ${esc(sj_c.owner.role)}${sj_c.owner.location ? ` · ${esc(sj_c.owner.location)}` : ''}</p>
  ${paragraphs(sj_c.about.paragraphs)}${sj_facts}${sj_resume}`;
}

function renderSkills(sj_c: PortfolioContent, sj_focus?: number): string {
  const sj_intro = sj_c.skills.intro ? `<p class="muted">${esc(sj_c.skills.intro)}</p>` : '';
  const sj_groups = sj_c.skills.groups
    .map(
      (
        sj_g,
        sj_i,
      ) => `<section class="card${sj_i === sj_focus ? ' card--focus' : ''}" data-index="${sj_i}">
        <h3>${esc(sj_g.name)}</h3>${sj_g.blurb ? `<p class="muted">${esc(sj_g.blurb)}</p>` : ''}
        <ul class="skill-list">${sj_g.items.map((sj_it) => `<li><span>${esc(sj_it.name)}</span>${sj_it.level ? levelSeals(sj_it.level) : ''}</li>`).join('')}</ul>
      </section>`,
    )
    .join('');
  return `${sj_intro}<div class="grid">${sj_groups}</div>`;
}

function renderJourney(sj_c: PortfolioContent, sj_focus?: number): string {
  const sj_intro = sj_c.journey.intro ? `<p class="muted">${esc(sj_c.journey.intro)}</p>` : '';
  return `${sj_intro}<ol class="timeline">${sj_c.journey.entries
    .map(
      (sj_e, sj_i) => `<li class="${sj_i === sj_focus ? 'timeline--focus' : ''}">
        <span class="when">${esc(sj_e.when)}</span>
        <div><h3>${esc(sj_e.title)}</h3>${sj_e.place ? `<p class="muted">${esc(sj_e.place)}</p>` : ''}${sj_e.description ? `<p>${esc(sj_e.description)}</p>` : ''}</div>
      </li>`,
    )
    .join('')}</ol>`;
}

export function renderProject(sj_p: Project): string {
  const sj_links = (sj_p.links ?? []).map((sj_l) => link(sj_l.label, sj_l.url)).join('');
  return `<article class="project">
    <header><h3>${esc(sj_p.title)}</h3>${sj_p.year ? `<span class="year">${esc(sj_p.year)}</span>` : ''}</header>
    ${sj_p.image ? `<img class="project__image" src="${esc(safeUrl(sj_p.image))}" alt="" loading="lazy" />` : ''}
    <p class="lead">${esc(sj_p.summary)}</p>
    ${paragraphs(sj_p.description)}
    <ul class="tags">${sj_p.tech.map((sj_t) => `<li>${esc(sj_t)}</li>`).join('')}</ul>
    ${sj_links ? `<p class="links">${sj_links}</p>` : ''}
  </article>`;
}

function renderProjects(sj_c: PortfolioContent, sj_focus?: number): string {
  const sj_items = sj_c.projects.items;
  if (sj_focus !== undefined && sj_items[sj_focus]) {
    const sj_others = sj_items
      .map((sj_p, sj_i) =>
        sj_i === sj_focus
          ? ''
          : `<li><button type="button" class="linkish" data-project="${sj_i}">${esc(sj_p.bannerTitle ?? sj_p.title)}</button></li>`,
      )
      .join('');
    return `<nav class="pager" aria-label="Projects">
        <button type="button" class="pager__btn" data-project="${(sj_focus - 1 + sj_items.length) % sj_items.length}" aria-label="Previous project">‹</button>
        <span>${sj_focus + 1} / ${sj_items.length}</span>
        <button type="button" class="pager__btn" data-project="${(sj_focus + 1) % sj_items.length}" aria-label="Next project">›</button>
      </nav>
      ${renderProject(sj_items[sj_focus]!)}
      ${sj_others ? `<h3 class="sub">More projects</h3><ul class="inline-list">${sj_others}</ul>` : ''}`;
  }
  const sj_intro = sj_c.projects.intro ? `<p class="muted">${esc(sj_c.projects.intro)}</p>` : '';
  return `${sj_intro}${sj_items.map(renderProject).join('')}`;
}

function renderContact(sj_c: PortfolioContent): string {
  const sj_email = sj_c.contact.email
    ? `<p class="contact-email">
        <a class="btn-link" href="mailto:${esc(sj_c.contact.email)}">${esc(sj_c.contact.email)}</a>
        <button type="button" class="linkish" data-copy="${esc(sj_c.contact.email)}">Copy</button>
      </p>`
    : '';
  const sj_links = sj_c.contact.links.map((sj_l) => link(sj_l.label, sj_l.url)).join('');
  return `<p class="lead">${esc(sj_c.contact.message)}</p>${sj_email}${sj_links ? `<p class="links">${sj_links}</p>` : ''}`;
}

/** Heading for a section, taken from the content file. */
export function sectionHeading(sj_id: SectionId, sj_c: PortfolioContent): string {
  switch (sj_id) {
    case 'welcome':
      return sj_c.welcome.heading;
    case 'about':
      return sj_c.about.heading;
    case 'skills':
      return sj_c.skills.heading;
    case 'journey':
      return sj_c.journey.heading;
    case 'projects':
      return sj_c.projects.heading;
    case 'contact':
      return sj_c.contact.heading;
  }
}

/** Body HTML for a section. `focus` highlights a skill group, milestone or project. */
export function renderSection(sj_id: SectionId, sj_c: PortfolioContent, sj_focus?: number): string {
  switch (sj_id) {
    case 'welcome':
      return renderWelcome(sj_c);
    case 'about':
      return renderAbout(sj_c);
    case 'skills':
      return renderSkills(sj_c, sj_focus);
    case 'journey':
      return renderJourney(sj_c, sj_focus);
    case 'projects':
      return renderProjects(sj_c, sj_focus);
    case 'contact':
      return renderContact(sj_c);
  }
}

export function sectionTitle(sj_id: SectionId, sj_c: PortfolioContent): string {
  return sectionHeading(sj_id, sj_c) || sectionMeta(sj_id).label;
}
