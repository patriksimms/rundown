import { defineConfig, devices } from '@playwright/test';

const port = resolvePort(process.env.RUNDOWN_E2E_PORT);
const baseURL = `http://localhost:${port}`;
// Attaching to whatever already listens on the port has produced runs against a stale build,
// so reuse is opt-in even locally.
const reuseExistingServer = process.env.RUNDOWN_E2E_REUSE_SERVER === '1';

function resolvePort(value: string | undefined) {
  if (!value) return 3140;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535)
    throw new Error(`RUNDOWN_E2E_PORT must be a port number, received "${value}".`);
  return parsed;
}

const authenticatedTests = '**/authenticated-*.spec.ts';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'line',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: authenticatedTests,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      testIgnore: authenticatedTests,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'authenticated',
      testMatch: authenticatedTests,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'RUNDOWN_DISABLE_CONTAINERS=1 bun run dev',
    url: `${baseURL}/health`,
    reuseExistingServer,
    timeout: 120_000,
    // Vite reads the port from here and points the dev data service at the same origin.
    env: { RUNDOWN_PORT: String(port) },
  },
});
