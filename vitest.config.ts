import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./client/src/test/setup.ts'],
    globals: true,
    include: ['client/src/test/**/*.{test,spec}.{ts,tsx}'],
  },
});
