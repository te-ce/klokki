import { defineConfig } from '@playwright/test'

// Drives the real packaged-ish app via Playwright's Electron support.
// Requires `pnpm build` first — tests launch out/main/index.js.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
})
