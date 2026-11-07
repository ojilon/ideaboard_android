import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * GitHub Pages has no SPA rewrites: unknown paths get 404.html. Emitting the
 * built index.html as 404.html means /share-target (and deep links) boot the app
 * with their query string intact, before the service worker even exists.
 */
function spaFallbackPlugin(): Plugin {
  return {
    name: 'ideaboard-spa-fallback',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const index = bundle['index.html'];
      if (index && index.type === 'asset') {
        this.emitFile({ type: 'asset', fileName: '404.html', source: index.source });
      }
    },
  };
}

// GitHub Pages serves project sites from /<repo>/, so the base is configurable.
// Local dev/build default to "/".
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    // Keep the bundle small and the low-end-CPU build fast.
    cssCodeSplit: false,
    assetsInlineLimit: 4096,
  },
  plugins: [
    spaFallbackPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Ideaboard',
        short_name: 'Ideaboard',
        description: 'Capture ideas in 3 seconds, arrange them on a board, connect your links.',
        id: `${base}`,
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#faf9f6',
        theme_color: '#faf9f6',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'New note', short_name: 'New note', url: './?action=new-note' },
          { name: 'Link inbox', short_name: 'Inbox', url: './?action=inbox' },
        ],
        share_target: {
          action: `${base}share-target`,
          method: 'GET',
          enctype: 'application/x-www-form-urlencoded',
          params: { title: 'title', text: 'text', url: 'url' },
        },
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webp,woff2,json}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
