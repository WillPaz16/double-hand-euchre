import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Single-player is the whole game engine running client-side already (§2 of the
      // architecture doc) — precaching every asset the generator produces is what makes
      // "installed to your phone's home screen, plays a full game with the network
      // disabled" (the Phase 2 done-when criterion) literally true, not aspirational.
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,wav,woff,woff2}'],
      },
      manifest: {
        name: 'Two-Handed Euchre',
        short_name: 'Euchre',
        description:
          'A two-player euchre variant where each player controls two hands, playing them alternately from memory.',
        theme_color: '#3a2415',
        background_color: '#211710',
        // 'standalone', not 'fullscreen': the architecture doc's "chrome-less launch" means no
        // browser UI, not no OS status bar too — fullscreen hides that as well and reads as
        // broken on some devices rather than as a game.
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: '/art/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/art/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/art/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
