/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Umami page-view analytics (cookieless, no cross-site tracking) in the landing page and the app, when
 * UMAMI_WEBSITE_ID is set (the id is public, it ships in the page). Only the production host reports, and
 * Do Not Track is honoured.
 */
function umami(websiteId: string | undefined): Plugin {
  return {
    name: 'umami',
    transformIndexHtml: () =>
      websiteId
        ? [
            {
              tag: 'script',
              injectTo: 'head',
              attrs: {
                defer: true,
                src: 'https://cloud.umami.is/script.js',
                'data-website-id': websiteId,
                'data-domains': 'unlined.1azy.ink',
                'data-do-not-track': 'true',
              },
            },
          ]
        : [],
  };
}

export default defineConfig(({ mode }) => ({
  base: '/',
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      { find: '@landing', replacement: fileURLToPath(new URL('./landing/src', import.meta.url)) },
      // One readable MathLive build in every mode, the one patches/ fixes; production minifies it like the rest.
      {
        find: /^mathlive$/,
        replacement: fileURLToPath(new URL('./node_modules/mathlive/mathlive.mjs', import.meta.url)),
      },
    ],
  },
  build: {
    // The landing page is the site root; the app lives under /app/.
    rollupOptions: {
      input: {
        landing: fileURLToPath(new URL('./index.html', import.meta.url)),
        app: fileURLToPath(new URL('./app/index.html', import.meta.url)),
      },
    },
    // The compute engine (~4 MB) is a single lazy chunk loaded only by Math+ and Graph nodes.
    chunkSizeWarningLimit: 4500,
  },
  plugins: [
    umami(loadEnv(mode, process.cwd(), ['UMAMI_']).UMAMI_WEBSITE_ID),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo/favicon.ico', 'logo/favicon.svg', 'logo/apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,woff2,png,ico,svg}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // Only app navigations fall back to the app shell; the landing page is its own document.
        navigateFallback: '/app/index.html',
        navigateFallbackAllowlist: [/^\/app\//],
      },
      manifest: {
        name: 'Unlined',
        short_name: 'Unlined',
        description: 'Infinite canvas for math, text, code & graphs',
        start_url: '/app/',
        scope: '/app/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#3b82f6',
        icons: [
          { src: 'logo/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'logo/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'logo/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'logo/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
}));
