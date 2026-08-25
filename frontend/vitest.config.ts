import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Test config kept separate from vite.config.ts on purpose: that file builds the
 * PWA service worker and wires the /api dev proxy, neither of which a test run
 * has any use for — and vite-plugin-pwa generating a service worker per test run
 * is pure noise.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
