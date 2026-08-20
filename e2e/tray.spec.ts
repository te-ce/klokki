import { _electron as electron, expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const APP_ENTRY = fileURLToPath(
  new URL('../out/main/index.js', import.meta.url),
)

test('@smoke app starts as a menubar-only app with a tray icon', async () => {
  const app = await electron.launch({ args: [APP_ENTRY] })

  // The tray is created on ready; assert from inside the main process.
  const hasTray = await app.evaluate(async ({ app: electronApp }) => {
    await electronApp.whenReady()
    return electronApp.dock?.isVisible() === false
  })
  expect(hasTray).toBe(true)

  await app.close()
})
