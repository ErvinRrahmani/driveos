import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';

function mockServiceWorker(): Plugin {
  const script = createRequire(import.meta.url).resolve('msw/mockServiceWorker.js');
  return {
    name: 'driveos-msw-worker',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/mockServiceWorker.js', (_request, response) => {
        response.setHeader('content-type', 'text/javascript');
        response.end(readFileSync(script));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(env.ADMIN_PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('ADMIN_PORT is missing; copy apps/admin/.env.example to .env');
  }
  return {
    plugins: [
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      mockServiceWorker(),
    ],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { port, strictPort: true },
    preview: { port, strictPort: true },
  };
});
