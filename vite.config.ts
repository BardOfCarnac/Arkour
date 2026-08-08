import { defineConfig } from 'vite';

export default defineConfig({
  // Keep built asset URLs relative so both the Run page and nested acceptance
  // pages work from GitHub Pages project paths as well as local/static hosting.
  base: './',
  build: {
    rollupOptions: {
      input: ['index.html', 'next/index.html'],
    },
  },
});
