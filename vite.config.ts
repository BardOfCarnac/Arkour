import { defineConfig } from 'vite';

export default defineConfig({
  // Keep built asset URLs relative so the Run page works from GitHub Pages
  // project paths (for example /Arkour/) as well as local/static hosting.
  base: './',
});
