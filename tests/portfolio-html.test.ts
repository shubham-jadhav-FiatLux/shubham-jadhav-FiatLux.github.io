import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderIndexHtml } from '../tools/portfolio-html.ts';
import * as prerender from '../src/ui/prerender';
import type { PortfolioContent } from '../src/content/types';

const template = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');

function withContent(patch: (c: PortfolioContent) => void): typeof prerender {
  const content = structuredClone(prerender.portfolio);
  patch(content);
  return { ...prerender, portfolio: content };
}

describe('index.html generation', () => {
  it('writes title, description and link-preview tags', () => {
    const html = renderIndexHtml(template, prerender);
    expect(html).toContain('<title>Valley of Whispering Bamboo · An explorable portfolio</title>');
    expect(html).toContain('<meta property="og:image" content="og-image.jpg" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).not.toContain('og:url');
  });

  it('uses absolute preview URLs when the site address is known', () => {
    const html = renderIndexHtml(template, prerender, 'https://me.github.io/valley');
    expect(html).toContain('content="https://me.github.io/valley/og-image.jpg"');
    expect(html).toContain('<link rel="canonical" href="https://me.github.io/valley/" />');
  });

  it('puts the whole portfolio into a single noscript page', () => {
    const html = renderIndexHtml(template, prerender);
    expect(html.match(/<noscript><div class="classic classic--static">/g)).toHaveLength(1);
    expect(html).toContain('id="classic-projects"');
    expect(html).toContain('<script type="module" src="/src/main.ts"></script>');
  });

  it('keeps dollar signs from the content literally', () => {
    const mod = withContent((c) => {
      c.projects.items[0]!.summary = "Type commands after the $ prompt: $& $' $` $1";
    });
    const html = renderIndexHtml(template, mod);
    expect(html).toContain('Type commands after the $ prompt: $&amp; $&#39; $` $1');
    expect(html.match(/<noscript><div class="classic classic--static">/g)).toHaveLength(1);
    expect(html.indexOf('<div id="loader"')).toBeLessThan(html.indexOf('classic--static'));
  });

  it('escapes markup in the content', () => {
    const mod = withContent((c) => {
      c.owner.name = '<img src=x onerror=alert(1)>';
      c.projects.items[0]!.title = '</noscript><script>alert(1)</script>';
    });
    const html = renderIndexHtml(template, mod);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;/noscript&gt;&lt;script&gt;');
  });
});
