/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Origin of the Django API, e.g. https://mediculus-dev....azurewebsites.net.
   * Leave unset to talk to the local backend through the /api proxy in
   * vite.config.ts, which is the simplest setup and what `npm run dev` assumes.
   */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
