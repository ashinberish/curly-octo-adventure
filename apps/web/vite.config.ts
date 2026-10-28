import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { devApiMiddleware } from '../server/src/dev.ts';

/** Serves the office API at /api from `vite dev` and `vite preview` (see apps/server/src/dev.ts). */
function officeApi(): Plugin {
  return {
    name: 'office-api',
    configureServer(server) { server.middlewares.use(devApiMiddleware()); },
    configurePreviewServer(server) { server.middlewares.use(devApiMiddleware()); },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), officeApi()],
  build: {
    chunkSizeWarningLimit: 2000, // Phaser is a single ~1.5 MB chunk
  },
  test: {
    environment: 'node',
  },
});
