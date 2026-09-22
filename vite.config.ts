import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const THEME = '#000000';

/**
 * Which build this is, for the small print on the front door: `1.0`, the number of commits behind it and
 * the commit itself, plus the moment it was built. The count only means anything on a full clone, so the
 * workflow checks out the whole history; a build without git at all still runs, it just says `dev`.
 */
function stamp(): { version: string; at: string } {
  const git = (args: string) => execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  const at = new Date().toISOString();
  try {
    return { version: `1.0.${git('rev-list --count HEAD')}.${git('rev-parse --short HEAD')}`, at };
  } catch {
    return { version: '1.0.dev', at };
  }
}

export default defineConfig({
  define: { __BUILD__: JSON.stringify(stamp()) },
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
