import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const frontendDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FRONTEND_PORT = 3001;

function getFrontendPort(value: string | undefined): number {
  const port = Number.parseInt(value ?? '', 10);

  return Number.isNaN(port) ? DEFAULT_FRONTEND_PORT : port;
}

export default defineConfig(({ mode }) => {
  // Keep frontend configuration anchored to this package even when Vite is
  // invoked from the repository root.
  const env = loadEnv(mode, frontendDir, '');
  const apiOrigin = env.VITE_API_ORIGIN ?? 'http://localhost:3000';
  const frontendPort = getFrontendPort(env.FRONTEND_PORT);

  return {
    envDir: frontendDir,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': resolve(frontendDir, 'src'),
      },
    },
    server: {
      port: frontendPort,
      proxy: {
        '/api': {
          target: apiOrigin,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
    },
  };
});
