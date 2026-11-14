import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built app works when served from any subpath
  // (e.g. GitHub Pages project sites like /spec-doctor/).
  base: './',
  root: './',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
