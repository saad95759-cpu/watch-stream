import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '/watch-party/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Service worker file emitted at /watch-party/sw.js
      base: '/watch-party/',
      scope: '/watch-party/',
      manifest: {
        name: 'Watch Stream',
        short_name: 'WatchStream',
        description: 'Watch videos together in sync with friends',
        theme_color: '#0f172a',
        background_color: '#06080d',
        display: 'standalone',
        scope: '/watch-party/',
        start_url: '/watch-party/',
        icons: [
          { src: 'icon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Web Share Target — lets mobile users share URLs from browser to this app
        share_target: {
          action: '/watch-party/',
          method: 'GET',
          params: {
            title: 'title',
            text: 'text',
            url: 'shared_url',
          },
        },
      },
    }),
  ],
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
