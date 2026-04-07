import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.BUILD_TYPE': JSON.stringify('hybrid')
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'client/src'),
    },
  },
  build: {
    outDir: 'dist/hybrid',
    rollupOptions: {
      input: resolve(__dirname, 'client/index.hybrid.html'),
      external: [],
      output: {
        manualChunks: undefined,
      },
    },
  },
  base: './',
  server: {
    port: 3003,
  },
});
