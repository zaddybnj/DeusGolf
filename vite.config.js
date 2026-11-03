import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

// Phone-installable shell. generateSW precaches the Vite build (including the
// bundled course) and falls back to index.html so the SPA opens offline.
export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'DeusGolf',
        short_name: 'DeusGolf',
        description: 'Phone-first golf round planner. Preview Los Verdes GC, edit your bag, and save a plan against your score.',
        theme_color: '#1f4d2b',
        background_color: '#f4f6f2',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        id: '/',
        lang: 'en',
        icons: [
          {src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any'},
          {src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any'},
          {src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable'},
          {src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable'},
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
});
