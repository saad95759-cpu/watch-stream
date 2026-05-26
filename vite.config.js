import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '/watch-party/',
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,

    // Security: No source maps in production
    sourcemap: false,

    // Aggressive minification via esbuild (built-in, no extra deps)
    minify: 'esbuild',

    // Minify CSS via esbuild
    cssMinify: true,

    // Code split CSS into separate files so styles are properly bundled
    cssCodeSplit: true,

    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
    },
  },

  // Dev server proxy (kept for local development)
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
});
