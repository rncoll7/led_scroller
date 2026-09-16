import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const THEME = '#000000';

export default defineConfig({
  server: { host: true },
  preview: { host: true },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      // start_url and scope come from Vite's `base`, so `vite build --base=/sub/` also works on a subpath.
      manifest: {
        // Relative on purpose: it resolves against the manifest URL, so identity
        // stays right for `--base=/sub/` builds too. Same value Chrome already
        // derives from start_url, so apps installed before this keep their identity.
        id: './',
        name: 'LED Scroller',
        short_name: 'LED',
        description: 'Letreiro de LED rolante em tela cheia: escreva, escolha as cores e mostre. Funciona offline.',
        lang: 'pt-BR',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'any',
        background_color: THEME,
        theme_color: THEME,
        categories: ['utilities', 'entertainment'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Screenshots turn Android's minimal install bar into the full install
        // dialog, with the picture and the description. Sizes must match the
        // files exactly or Chrome silently drops them and falls back to the bar.
        screenshots: [
          { src: 'screenshot-narrow.png', sizes: '1080x1920', type: 'image/png', form_factor: 'narrow', label: 'LED Scroller' },
          { src: 'screenshot-wide.png', sizes: '1920x1080', type: 'image/png', form_factor: 'wide', label: 'LED Scroller' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // The screenshots are install-dialog art, never requested by the running
        // app: precaching them would put ~1 MB of dead weight in the offline cache.
        globIgnores: ['**/screenshot-*.png'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
