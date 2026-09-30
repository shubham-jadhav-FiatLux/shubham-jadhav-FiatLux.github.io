import type { PortfolioContent, Project } from '../content/types';
import { sectionMeta, type SectionId } from '../content/sections';

/** Escapes text for safe interpolation into HTML. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only allow http(s), mailto and relative links. */
export function safeUrl(url: string): string {
  const u = url.trim();
  if (/^(https?:|mailto:|\/|\.\/|#)/i.test(u)) return u;
  return '#';
}

function link(label: string, url: string, cls = 'chip-link'): string {
  const external = /^https?:/i.test(url);
  return `<a class="${cls}" href="${esc(safeUrl(url))}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(label)}${external ? '<span aria-hidden="true"> ↗</span>' : ''}</a>`;
}

function paragraphs(list: string[] | undefined): string {
  return (list ?? []).map((p) => `<p>${esc(p)}</p>`).join('');
}

function levelSeals(level = 0): string {
  const n = Math.max(0, Math.min(5, Math.round(level)));
  const seals = Array.from(
    { length: 5 },
    (_, i) => `<i class="lvl${i < n ? ' lvl--on' : ''}"></i>`,
  ).join('');
  return `<span class="levels" role="img" aria-label="${n} out of 5">${seals}</span>`;
}

export const CONTROLS: [string, string][] = [
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

export const TOUCH_CONTROLS: [string, string][] = [
  ['Left thumb', 'Joystick: walk, push fully to run'],
  ['Right side', 'Drag to look around'],
  ['⤒', 'Jump'],
  ['拳', 'Kung-fu strike'],
  ['E', 'Read a scroll, ring the bell'],
  ['Map button', 'Map and quick travel'],
];

function controlList(list: [string, string][], cls: string): string {
  return `<dl class="controls ${cls}">${list.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}

function renderWelcome(c: PortfolioContent): string {
  return `${paragraphs(c.welcome.paragraphs)}
  <h3 class="sub">How to play</h3>
  ${controlList(CONTROLS, 'controls--keys')}${controlList(TOUCH_CONTROLS, 'controls--touch')}
  <p class="muted controls--keys-note">A gamepad works too: left stick to walk, A to jump, X to strike, Y to read.</p>`;
}

function renderAbout(c: PortfolioContent): string {
  const facts = c.about.facts?.length
    ? `<dl class="facts">${c.about.facts.map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('')}</dl>`
    : '';
  const resume = c.owner.resumeUrl
    ? `<p>${link('Download my résumé', c.owner.resumeUrl, 'btn-link')}</p>`
    : '';
  return `<p class="lead"><strong>${esc(c.owner.name)}</strong> · ${esc(c.owner.role)}${c.owner.location ? ` · ${esc(c.owner.location)}` : ''}</p>
  ${paragraphs(c.about.paragraphs)}${facts}${resume}`;
}

function renderSkills(c: PortfolioContent, focus?: number): string {
  const intro = c.skills.intro ? `<p class="muted">${esc(c.skills.intro)}</p>` : '';
  const groups = c.skills.groups
    .map(
      (g, i) => `<section class="card${i === focus ? ' card--focus' : ''}" data-index="${i}">
        <h3>${esc(g.name)}</h3>${g.blurb ? `<p class="muted">${esc(g.blurb)}</p>` : ''}
        <ul class="skill-list">${g.items.map((it) => `<li><span>${esc(it.name)}</span>${it.level ? levelSeals(it.level) : ''}</li>`).join('')}</ul>
      </section>`,
    )
    .join('');
  return `${intro}<div class="grid">${groups}</div>`;
}

function renderJourney(c: PortfolioContent, focus?: number): string {
  const intro = c.journey.intro ? `<p class="muted">${esc(c.journey.intro)}</p>` : '';
  return `${intro}<ol class="timeline">${c.journey.entries
    .map(
      (e, i) => `<li class="${i === focus ? 'timeline--focus' : ''}">
        <span class="when">${esc(e.when)}</span>
        <div><h3>${esc(e.title)}</h3>${e.place ? `<p class="muted">${esc(e.place)}</p>` : ''}${e.description ? `<p>${esc(e.description)}</p>` : ''}</div>
      </li>`,
    )
    .join('')}</ol>`;
}

export function renderProject(p: Project): string {
  const links = (p.links ?? []).map((l) => link(l.label, l.url)).join('');
  return `<article class="project">
    <header><h3>${esc(p.title)}</h3>${p.year ? `<span class="year">${esc(p.year)}</span>` : ''}</header>
    ${p.image ? `<img class="project__image" src="${esc(safeUrl(p.image))}" alt="" loading="lazy" />` : ''}
    <p class="lead">${esc(p.summary)}</p>
    ${paragraphs(p.description)}
    <ul class="tags">${p.tech.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    ${links ? `<p class="links">${links}</p>` : ''}
  </article>`;
}

function renderProjects(c: PortfolioContent, focus?: number): string {
  const items = c.projects.items;
  if (focus !== undefined && items[focus]) {
    const others = items
      .map((p, i) =>
        i === focus
          ? ''
          : `<li><button type="button" class="linkish" data-project="${i}">${esc(p.bannerTitle ?? p.title)}</button></li>`,
      )
      .join('');
    return `<nav class="pager" aria-label="Projects">
        <button type="button" class="pager__btn" data-project="${(focus - 1 + items.length) % items.length}" aria-label="Previous project">‹</button>
        <span>${focus + 1} / ${items.length}</span>
        <button type="button" class="pager__btn" data-project="${(focus + 1) % items.length}" aria-label="Next project">›</button>
      </nav>
      ${renderProject(items[focus]!)}
      ${others ? `<h3 class="sub">More projects</h3><ul class="inline-list">${others}</ul>` : ''}`;
  }
  const intro = c.projects.intro ? `<p class="muted">${esc(c.projects.intro)}</p>` : '';
  return `${intro}${items.map(renderProject).join('')}`;
}

function renderContact(c: PortfolioContent): string {
  const email = c.contact.email
    ? `<p class="contact-email">
        <a class="btn-link" href="mailto:${esc(c.contact.email)}">${esc(c.contact.email)}</a>
        <button type="button" class="linkish" data-copy="${esc(c.contact.email)}">Copy</button>
      </p>`
    : '';
  const links = c.contact.links.map((l) => link(l.label, l.url)).join('');
  return `<p class="lead">${esc(c.contact.message)}</p>${email}${links ? `<p class="links">${links}</p>` : ''}`;
}

/** Heading for a section, taken from the content file. */
export function sectionHeading(id: SectionId, c: PortfolioContent): string {
  switch (id) {
    case 'welcome':
      return c.welcome.heading;
    case 'about':
      return c.about.heading;
    case 'skills':
      return c.skills.heading;
    case 'journey':
      return c.journey.heading;
    case 'projects':
      return c.projects.heading;
    case 'contact':
      return c.contact.heading;
  }
}

/** Body HTML for a section. `focus` highlights a skill group, milestone or project. */
export function renderSection(id: SectionId, c: PortfolioContent, focus?: number): string {
  switch (id) {
    case 'welcome':
      return renderWelcome(c);
    case 'about':
      return renderAbout(c);
    case 'skills':
      return renderSkills(c, focus);
    case 'journey':
      return renderJourney(c, focus);
    case 'projects':
      return renderProjects(c, focus);
    case 'contact':
      return renderContact(c);
  }
}

export function sectionTitle(id: SectionId, c: PortfolioContent): string {
  return sectionHeading(id, c) || sectionMeta(id).label;
}
