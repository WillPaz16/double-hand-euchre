/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  test: {
    // Agent worktrees live at `.claude/worktrees/<id>/` — INSIDE this repo, each one a full
    // checkout carrying its own copy of `tests/`. Vitest's default globs walk straight into
    // them, so a plain `vitest run` at the repo root was executing this suite once per
    // worktree: 42 files and 432 tests where the project has 15 and 152.
    //
    // That is worse than a cosmetic miscount. It inflates every green run into a number nobody
    // can sanity-check, and it makes this repo's suite fail for a stale or half-finished
    // experiment sitting in someone else's worktree — a failure with no cause anywhere in the
    // committed tree. Found by noticing the same commit reported 152 tests inside a worktree
    // and 432 at the root.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt', not 'autoUpdate': a deploy used to reach players only after they closed the game
      // or reloaded twice. The new version now installs in the background and UpdatePrompt offers
      // a reload. With the virtual:pwa-register import in UpdatePrompt, the plugin no longer
      // injects its own registerSW.js.
      registerType: 'prompt',
      // Single-player is the whole game engine running client-side already (§2 of the
      // architecture doc) — precaching every asset the generator produces is what makes
      // "installed to your phone's home screen, plays a full game with the network
      // disabled" (the Phase 2 done-when criterion) literally true, not aspirational.
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,wav,woff,woff2}'],
      },
      manifest: {
        name: 'Double-Hand Euchre',
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
