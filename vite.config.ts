import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { handleApiRequest } from './src/server/api-plugin';
import { ensureNewsStarted } from './src/server/news-feed';

function softradexApiPlugin(): Plugin {
  return {
    name: 'softradex-api-plugin',
    configureServer(server) {
      ensureNewsStarted();
      server.middlewares.use(async (req, res, next) => {
        try {
          const handled = await handleApiRequest(req, res);
          if (!handled) next();
        } catch (err) {
          next(err);
        }
      });
    },
    configurePreviewServer(server) {
      ensureNewsStarted();
      server.middlewares.use(async (req, res, next) => {
        try {
          const handled = await handleApiRequest(req, res);
          if (!handled) next();
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), softradexApiPlugin()],
  server: {
    host: '127.0.0.1',
    port: 8777,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1000,
  },
});
