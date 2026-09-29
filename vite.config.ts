/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

export default defineConfig({
  // Relative base so the build works on GitHub Pages sub-paths, custom
  // domains and static hosts alike.
  base: './',
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
