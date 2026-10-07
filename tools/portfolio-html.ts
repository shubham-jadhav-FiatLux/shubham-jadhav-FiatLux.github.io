import { resolve } from 'node:path';
import { runnerImport, type Plugin } from 'vite';
import type * as Prerender from '../src/ui/prerender.ts';
import type { PortfolioContent } from '../src/content/types.ts';

export interface PortfolioHtmlOptions {
  /**
   * Public address of the site. Link previews need absolute image URLs. Falls back to
   * `site.url` from the content file.
   */
  siteUrl?: string;
}

const sj_withSlash = (sj_url: string) => (sj_url.endsWith('/') ? sj_url : `${sj_url}/`);

/** Title and description for search results and link previews. */
function pageMeta(sj_content: PortfolioContent): { title: string; description: string } {
  const sj_named = !sj_content.owner.name.includes('[');
  const sj_title = `${sj_content.site.title} · ${sj_named ? sj_content.owner.name : 'An explorable portfolio'}`;
  const sj_description = sj_named
    ? `${sj_content.owner.name}, ${sj_content.owner.role}. ${sj_content.owner.intro} Walk through the portfolio as a 3D valley, or read it as a page.`
    : 'An explorable 3D portfolio: guide a panda through a misty valley of bamboo, blossoms and pagodas to discover projects, skills and stories.';
  return { title: sj_title, description: sj_description };
}

/**
 * Writes the content into the index.html template: `<title>`, meta description, Open
 * Graph / Twitter tags, the title screen's name and seal, and the `<noscript>` page.
 * Pure, so it can be unit-tested.
 */
export function renderIndexHtml(
  sj_html: string,
  sj_mod: typeof Prerender,
  sj_siteUrl?: string,
): string {
  const { sj_portfolio: sj_content, classicHtml: sj_classicHtml, esc: sj_esc } = sj_mod;
  const { title: sj_title, description: sj_description } = pageMeta(sj_content);
  const sj_url = sj_siteUrl || sj_content.site.url;
  const sj_base = sj_url ? sj_withSlash(sj_url) : undefined;
  const sj_image = sj_base ? new URL('og-image.jpg', sj_base).href : 'og-image.jpg';
  const sj_prop = (sj_property: string, sj_value: string) =>
    `<meta property="${sj_property}" content="${sj_esc(sj_value)}" />`;
  const sj_head = [
    sj_prop('og:type', 'website'),
    sj_prop('og:site_name', sj_content.site.title),
    sj_prop('og:title', sj_title),
    sj_prop('og:description', sj_description),
    sj_prop('og:image', sj_image),
    sj_prop('og:image:width', '1200'),
    sj_prop('og:image:height', '630'),
    sj_prop('og:image:alt', `${sj_content.site.title}: a painted valley with a pagoda and a lake`),
    ...(sj_base
      ? [sj_prop('og:url', sj_base), `<link rel="canonical" href="${sj_esc(sj_base)}" />`]
      : []),
    '<meta name="twitter:card" content="summary_large_image" />',
    // Without JavaScript the title screen would wait forever: show the page copy.
    '<noscript><style>.loader { display: none !important; }</style></noscript>',
  ]
    .map((sj_line) => `    ${sj_line}`)
    .join('\n');
  const sj_page = sj_classicHtml(sj_content, {
    canPlay: false,
    note: 'Turn on JavaScript to walk through this portfolio as a 3D valley.',
  });
  // Replacer functions, not strings: content may contain "$&", "$'" and friends, which
  // String.replace would otherwise expand.
  return (
    sj_html
      .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${sj_esc(sj_title)}</title>`)
      .replace(
        /<meta\s+name="description"[\s\S]*?\/>/,
        () => `<meta name="description" content="${sj_esc(sj_description)}" />`,
      )
      .replace('</head>', () => `${sj_head}\n  </head>`)
      // the title screen shows before any script runs
      .replace(
        /(<h1 id="loader-title" class="loader__title">)[\s\S]*?(<\/h1>)/,
        (_sj_m, sj_open: string, sj_close: string) =>
          `${sj_open}${sj_esc(sj_content.site.title)}${sj_close}`,
      )
      .replace(
        /(<div class="seal seal--lg loader__seal" aria-hidden="true">)[\s\S]*?(<\/div>)/,
        (_sj_m, sj_open: string, sj_close: string) =>
          `${sj_open}${sj_esc(sj_content.site.seal)}${sj_close}`,
      )
      .replace(
        /<noscript>\s*<div class="noscript">[\s\S]*?<\/noscript>/,
        () => `<noscript><div class="classic classic--static">${sj_page}</div></noscript>`,
      )
  );
}

/**
 * Vite plugin that writes the portfolio into index.html (at build time and in dev) so
 * search engines, link unfurlers and visitors without JavaScript get the content too.
 * The content is TypeScript, so it is loaded through Vite's module runner rather than
 * imported by the config.
 */
export function portfolioHtml(sj_options: PortfolioHtmlOptions = {}): Plugin {
  let sj_root = process.cwd();
  return {
    name: 'portfolio-html',
    configResolved(sj_config) {
      sj_root = sj_config.root;
    },
    transformIndexHtml: {
      order: 'pre',
      async handler(sj_html) {
        const { module: sj_module } = await runnerImport<typeof Prerender>(
          resolve(sj_root, 'src/ui/prerender.ts'),
          { configFile: false, logLevel: 'error', root: sj_root },
        );
        return renderIndexHtml(sj_html, sj_module, sj_options.siteUrl);
      },
    },
  };
}
