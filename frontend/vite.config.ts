/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// PWA caches the app shell only (JS/CSS/fonts/icons) so the app opens with no signal.
// API calls and uploaded documents are NEVER cached by the service worker (privacy).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Last Mile Relief Helper (prototype)',
        short_name: 'Last Mile',
        description: 'Prototype only. Not an official government service.',
        theme_color: '#1F6F5C',
        background_color: '#F1F5F2',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [{ urlPattern: /\/api\//, handler: 'NetworkOnly' }],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] },
})
