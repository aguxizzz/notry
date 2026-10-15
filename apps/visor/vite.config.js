import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Atajos de dev a prototipos de design-lab (sin esto el path cae en el
// fallback del SPA y se interpreta como slug de proyecto).
const DESIGN_LAB_ROUTES = { '/leyenda': '/design-lab/leyenda.html' };

const designLabRoutes = {
  name: 'design-lab-routes',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const [path, query] = req.url.split('?');
      const target = DESIGN_LAB_ROUTES[path.replace(/\/$/, '')];
      if (target) req.url = query ? `${target}?${query}` : target;
      next();
    });
  },
};

export default defineConfig({
  plugins: [react(), designLabRoutes],
  root: '.',
  publicDir: 'public',
  server: {
    port: 5173,
    open: true,
  },
});
