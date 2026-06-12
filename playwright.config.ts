import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
const isRemote = baseURL.startsWith('https://')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: isRemote ? 2 : undefined,
  reporter: 'html',
  expect: {
    timeout: isRemote ? 20_000 : 8_000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    viewport: { width: 390, height: 844 },
    actionTimeout: isRemote ? 20_000 : 8_000,
    navigationTimeout: isRemote ? 30_000 : 15_000,
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  // Only spin up the dev server when testing locally
  webServer: isRemote ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
  },
})
