import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The visor's map ground (satellite / render), reused by the geo
      // calibration map. Lives in the visor, not in a shared package, because
      // the visor deploys on its own from apps/visor (own lockfile) and the
      // editor only runs locally, where the monorepo's node_modules exist.
      '@map3d': fileURLToPath(new URL('../visor/src/map3d', import.meta.url)),
    },
  },
})
