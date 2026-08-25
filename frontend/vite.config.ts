import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // '' as the prefix so an unprefixed var is visible: this one configures the
  // dev server only and must never reach the client bundle.
  const env = loadEnv(mode, process.cwd(), '')

  // Where `npm run dev` forwards /api. Override in frontend/.env.local.local (which is
  // git-ignored) when your Django listens elsewhere — e.g. because something
  // else already owns port 8000 on your machine:
  //   API_PROXY_TARGET=http://127.0.0.1:8001
  const apiProxyTarget = env.API_PROXY_TARGET || 'http://127.0.0.1:8000'

  return {
    // Proxying /api keeps the dev server same-origin with the API: no CORS
    // preflights, and the session cookie is sent as a first-party cookie.
    //
    // The proxy rewrites Host to the target, so Django compares the browser's
    // Origin (this dev server) against a Host it does not match, and its CSRF
    // origin check fails. The fix is on the Django side: this origin has to be
    // listed in CSRF_TRUSTED_ORIGINS.
    server: {
      strictPort : true,
      proxy: {
        '/api': apiProxyTarget,
      },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'Mediculus',
          short_name: 'Mediculus',
          description: 'Mediculus',
          theme_color: '#4a90d9',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
          ],
        },
      }),
    ],
  }
})
