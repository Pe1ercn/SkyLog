import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  root,
  base: './',
  publicDir: false,
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'chrome130',
    assetsInlineLimit: 4096,
    cssCodeSplit: false,
    sourcemap: false,
  },
  server: {
    port: 5199,
    strictPort: true,
  },
});
