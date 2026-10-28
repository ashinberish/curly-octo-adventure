import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 2000, // Phaser is a single ~1.5 MB chunk
  },
  test: {
    environment: 'node',
  },
});
