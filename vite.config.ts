import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  base: './',
  plugins: [wasm()],
  build: { target: 'esnext', outDir: 'dist', chunkSizeWarningLimit: 20000 },
  optimizeDeps: { esbuildOptions: { target: 'esnext' } },
});
