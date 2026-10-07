import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderIndexHtml } from '../tools/portfolio-html.ts';
import * as prerender from '../src/ui/prerender';
import type { PortfolioContent } from '../src/content/types';

const sj_template = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');

function withContent(sj_patch: (sj_c: PortfolioContent) => void): typeof prerender {
  const sj_content = structuredClone(prerender.sj_portfolio);
  sj_patch(sj_content);
  return { ...prerender, sj_portfolio: sj_content };
}

describe('index.html generation', () => {
  it('writes title, description and link-preview tags', () => {
    const sj_html = renderIndexHtml(sj_template, prerender);
    expect(sj_html).toContain('<title>Valley of Peace · An explorable portfolio</title>');
    expect(sj_html).toContain('<meta property="og:image" content="og-image.jpg" />');
    expect(sj_html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(sj_html).not.toContain('og:url');
  });

  it('uses absolute preview URLs when the site address is known', () => {
    const sj_html = renderIndexHtml(sj_template, prerender, 'https://me.github.io/valley');
    expect(sj_html).toContain('content="https://me.github.io/valley/og-image.jpg"');
    expect(sj_html).toContain('<link rel="canonical" href="https://me.github.io/valley/" />');
  });

  it('puts the whole portfolio into a single noscript page', () => {
    const sj_html = renderIndexHtml(sj_template, prerender);
    expect(sj_html.match(/<noscript><div class="classic classic--static">/g)).toHaveLength(1);
    expect(sj_html).toContain('id="classic-projects"');
    expect(sj_html).toContain('<script type="module" src="/src/main.ts"></script>');
  });

  it('puts the name and the seal on the title screen', () => {
    const sj_mod = withContent((sj_c) => {
      sj_c.site.title = 'Valley & Hills';
      sj_c.site.seal = '山';
    });
    const sj_html = renderIndexHtml(sj_template, sj_mod);
    expect(sj_html).toContain(
      '<h1 id="loader-title" class="loader__title">Valley &amp; Hills</h1>',
    );
    expect(sj_html).toContain(
      '<div class="seal seal--lg loader__seal" aria-hidden="true">山</div>',
    );
  });

  it('keeps dollar signs from the content literally', () => {
    const sj_mod = withContent((sj_c) => {
      sj_c.projects.items[0]!.summary = "Type commands after the $ prompt: $& $' $` $1";
    });
    const sj_html = renderIndexHtml(sj_template, sj_mod);
    expect(sj_html).toContain('Type commands after the $ prompt: $&amp; $&#39; $` $1');
    expect(sj_html.match(/<noscript><div class="classic classic--static">/g)).toHaveLength(1);
    expect(sj_html.indexOf('<div id="loader"')).toBeLessThan(sj_html.indexOf('classic--static'));
  });

  it('escapes markup in the content', () => {
    const sj_mod = withContent((sj_c) => {
      sj_c.owner.name = '<img src=x onerror=alert(1)>';
      sj_c.projects.items[0]!.title = '</noscript><script>alert(1)</script>';
    });
    const sj_html = renderIndexHtml(sj_template, sj_mod);
    expect(sj_html).not.toContain('<img src=x');
    expect(sj_html).not.toContain('<script>alert(1)</script>');
    expect(sj_html).toContain('&lt;/noscript&gt;&lt;script&gt;');
  });
});
