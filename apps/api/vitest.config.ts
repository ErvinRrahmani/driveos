import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    setupFiles: ['reflect-metadata'],
    env: { NODE_ENV: 'test', LOG_LEVEL: 'silent', RATE_LIMIT_ENABLED: 'false' },
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
