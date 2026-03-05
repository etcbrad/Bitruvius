import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from 'url';

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "client", "src"),
      "@shared": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "shared"),
      "@assets": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "attached_assets"),
    },
  },
  root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "client"),
  build: {
    outDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "deploy"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: undefined, // Disable code splitting for smaller deployments
      },
    },
    minify: "esbuild",
    sourcemap: false,
    assetsInlineLimit: 4096, // Inline small assets
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
