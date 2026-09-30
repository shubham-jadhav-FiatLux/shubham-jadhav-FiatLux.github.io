/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { portfolioHtml } from './tools/portfolio-html.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

export default defineConfig({
  // Relative base so the build works on GitHub Pages sub-paths, custom
  // domains and static hosts alike.
  base: './',
  // SITE_URL is set by the GitHub Pages workflow; content.site.url works for other hosts.
  plugins: [portfolioHtml({ siteUrl: process.env.SITE_URL })],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: { host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
