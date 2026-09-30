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

const withSlash = (url: string) => (url.endsWith('/') ? url : `${url}/`);

/** Title and description for search results and link previews. */
function pageMeta(content: PortfolioContent): { title: string; description: string } {
  const named = !content.owner.name.includes('[');
  const title = `${content.site.title} · ${named ? content.owner.name : 'An explorable portfolio'}`;
  const description = named
    ? `${content.owner.name}, ${content.owner.role}. ${content.owner.intro} Walk through the portfolio as a 3D valley, or read it as a page.`
    : 'An explorable 3D portfolio: guide a panda through a misty valley of bamboo, blossoms and pagodas to discover projects, skills and stories.';
  return { title, description };
}

/**
 * Writes the portfolio into index.html (at build time and in dev):
 * - `<title>` and meta description from the content file,
 * - Open Graph and Twitter tags so shared links unfurl with a picture,
 * - a complete `<noscript>` copy of the portfolio, so visitors without JavaScript,
 *   search engines and link unfurlers still get the content.
 *
 * The content is TypeScript, so it is loaded through Vite's module runner rather than
 * imported by the config.
 */
export function portfolioHtml(options: PortfolioHtmlOptions = {}): Plugin {
  let root = process.cwd();
  return {
    name: 'portfolio-html',
    configResolved(config) {
      root = config.root;
    },
    transformIndexHtml: {
      order: 'pre',
      async handler(html) {
        const { module } = await runnerImport<typeof Prerender>(
          resolve(root, 'src/ui/prerender.ts'),
          { configFile: false, logLevel: 'error', root },
        );
        const { portfolio: content, classicHtml, esc } = module;
        const { title, description } = pageMeta(content);
        const siteUrl = options.siteUrl || content.site.url;
        const base = siteUrl ? withSlash(siteUrl) : undefined;
        const image = base ? new URL('og-image.jpg', base).href : 'og-image.jpg';
        const prop = (property: string, value: string) =>
          `<meta property="${property}" content="${esc(value)}" />`;
        const head = [
          prop('og:type', 'website'),
          prop('og:site_name', content.site.title),
          prop('og:title', title),
          prop('og:description', description),
          prop('og:image', image),
          prop('og:image:width', '1200'),
          prop('og:image:height', '630'),
          prop('og:image:alt', `${content.site.title}: a painted valley with a pagoda and a lake`),
          ...(base ? [prop('og:url', base), `<link rel="canonical" href="${esc(base)}" />`] : []),
          '<meta name="twitter:card" content="summary_large_image" />',
          // Without JavaScript the title screen would wait forever: show the page copy.
          '<noscript><style>.loader { display: none !important; }</style></noscript>',
        ]
          .map((line) => `    ${line}`)
          .join('\n');
        const page = classicHtml(content, {
          canPlay: false,
          note: 'Turn on JavaScript to walk through this portfolio as a 3D valley.',
        });
        return html
          .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
          .replace(
            /<meta\s+name="description"[\s\S]*?\/>/,
            `<meta name="description" content="${esc(description)}" />`,
          )
          .replace('</head>', `${head}\n  </head>`)
          .replace(
            /<noscript>\s*<div class="noscript">[\s\S]*?<\/noscript>/,
            `<noscript><div class="classic classic--static">${page}</div></noscript>`,
          );
      },
    },
  };
}
