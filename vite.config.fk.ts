import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.BUILD_TYPE': JSON.stringify('fk')
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'client/src'),
    },
  },
  build: {
    outDir: 'dist/fk',
    rollupOptions: {
      input: resolve(__dirname, 'client/index.fk.html'),
      external: [],
      output: {
        manualChunks: undefined,
      },
    },
    modulePreload: {
      polyfill: false,
    },
  },
  base: './',
  server: {
    port: 3001,
  },
});
