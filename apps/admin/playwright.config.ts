import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

const API_URL = 'http://localhost:13000';
const MOCK_PORT = 15174;
const REAL_API_PORT = 15173;
const isCI = !!process.env.CI;
const realApi = process.env.E2E_REAL_API === '1';
const ARTIFACTS = 'node_modules/.cache/playwright';

type WebServer = NonNullable<Exclude<PlaywrightTestConfig['webServer'], unknown[]>>;

function viteServer(port: number, useMocks: boolean): WebServer {
  return {
    command: `pnpm exec vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !useMocks,
    timeout: 120_000,
    env: { ADMIN_PORT: String(port), VITE_API_URL: API_URL, VITE_USE_MOCKS: String(useMocks) },
  };
}

export default defineConfig({
  outputDir: `${ARTIFACTS}/test-results`,
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI
    ? [['github'], ['html', { open: 'never', outputFolder: `${ARTIFACTS}/report` }]]
    : [['list']],
  use: {
    trace: isCI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: realApi
    ? [
        {
          name: 'real-api',
          testDir: './e2e/real-api',
          use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${REAL_API_PORT}` },
        },
      ]
    : [
        {
          name: 'chromium',
          testDir: './e2e/tests',
          use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${MOCK_PORT}` },
        },
      ],
  webServer: realApi ? viteServer(REAL_API_PORT, false) : viteServer(MOCK_PORT, true),
});
