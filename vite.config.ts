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
    // Safari 15 cannot parse class static blocks (used by three.js); lowering them keeps
    // older iPhones on the page instead of stuck on the title screen.
    target: ['es2022', 'safari15'],
    chunkSizeWarningLimit: 1600,
    rolldownOptions: {
      output: {
        // three.js and postprocessing change rarely: a separate chunk stays cached
        // across deploys of the game code.
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/](three|postprocessing)[\\/]/ }],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
