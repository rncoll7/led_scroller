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
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
