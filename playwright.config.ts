import { defineConfig, devices } from '@playwright/test'

// End-to-end smoke suite (e2e/**). Runs against the production build served by `vite preview`
// on its own port, so it never collides with a dev server (5173 / 5199).
// E2E_SKIP_BUILD=1 serves an existing dist/ (CI builds once in an earlier step).
// E2E_BASE_URL=<url> tests an already running app (e.g. a deployed preview); no server is started.

const PORT = 4199
const externalUrl = process.env.E2E_BASE_URL
// Explicit IPv4 host: `localhost` may resolve to ::1 only on some machines.
const HOST = '127.0.0.1'
const BASE_URL = externalUrl ?? `http://${HOST}:${PORT}`
const isCi = process.env.CI !== undefined && process.env.CI !== ''
const skipBuild = process.env.E2E_SKIP_BUILD === '1'
const preview = `npx vite preview --host ${HOST} --port ${PORT} --strictPort`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: isCi ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: isCi ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], permissions: ['clipboard-read', 'clipboard-write'] },
    },
    {
      // Phone width the UI is designed for (docs/PLAN_V2.md); runs the tests tagged @mobile.
      name: 'mobile',
      grep: /@mobile/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 360, height: 740 },
        isMobile: true,
        hasTouch: true,
        permissions: ['clipboard-read', 'clipboard-write'],
      },
    },
  ],
  webServer:
    externalUrl === undefined
      ? {
          command: skipBuild ? preview : `npx vite build && ${preview}`,
          url: BASE_URL,
          reuseExistingServer: !isCi,
          timeout: 180_000,
          stdout: 'ignore',
          stderr: 'pipe',
        }
      : undefined,
})
