import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { handleApiRequest } from './src/server/api-plugin';
import { applyDocumentSessionMiddleware } from './src/server/api-security';
import { ensureNewsStarted } from './src/server/news-feed';

function attachApiSecurityMiddleware(middlewares: { use: Function }): void {
  ensureNewsStarted();
  middlewares.use(async (req: any, res: any, next: Function) => {
    try {
      if (applyDocumentSessionMiddleware(req, res)) return;
      const handled = await handleApiRequest(req, res);
      if (!handled) next();
    } catch (err) {
      next(err);
    }
  });
}

function softradexApiPlugin(): Plugin {
  return {
    name: 'softradex-api-plugin',
    configureServer(server) {
      attachApiSecurityMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachApiSecurityMiddleware(server.middlewares);
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
