import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // preview.html imports visor-deptos from the sibling app: one React for both, or its hooks break.
  resolve: { dedupe: ['react', 'react-dom'] },
  server: {
    port: 5179,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        preview: resolve(import.meta.dirname, 'preview.html'),
      },
    },
  },
});
