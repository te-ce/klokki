import { expect, test, type Page } from '@playwright/test'
import {
  clickMenuItem,
  close,
  launch,
  startPreset,
  subscriberCount,
  trayTitle,
  type KlokkiApp,
} from './harness'

/** Opens the settings window the way a user does: from the tray menu. */
const openSettings = async (app: KlokkiApp): Promise<Page> => {
  const opening = app.waitForEvent('window')
  expect(await clickMenuItem(app, 'Settings…')).toBe(true)
  const page = await opening
  await page.waitForLoadState('domcontentloaded')
  return page
}

const countdown = (page: Page) => page.getByTestId('countdown')

test('@smoke shows the running timer as soon as the window opens', async () => {
  const app = await launch()
  await startPreset(app, 'pomodoro')

  const page = await openSettings(app)

  // No tick has been waited for: the window asks for the current view on mount.
  await expect(countdown(page)).toHaveText(/^2[45]:\d\d$/)
  await expect(page.getByText('Pomodoro — Focus')).toBeVisible()

  await close(app)
})

test('advances the countdown in the window on its own', async () => {
  const app = await launch()
  await startPreset(app, 'pomodoro')
  const page = await openSettings(app)
  const first = await countdown(page).textContent()

  await expect
    .poll(() => countdown(page).textContent(), { timeout: 5_000 })
    .not.toBe(first)

  await close(app)
})

test('starting and stopping from the window moves the menubar', async () => {
  const app = await launch()
  const page = await openSettings(app)

  await page.getByRole('button', { name: 'Start Pomodoro' }).click()
  await expect.poll(() => trayTitle(app), { timeout: 5_000 }).toMatch(/2[45]:/)

  await page.getByRole('button', { name: 'Stop' }).click()
  await expect.poll(() => trayTitle(app), { timeout: 5_000 }).toBe('')

  await close(app)
})

test('reflects a preset started from the menubar in an open window', async () => {
  const app = await launch()
  const page = await openSettings(app)
  await expect(page.getByText('Nothing running.')).toBeVisible()

  await startPreset(app, 'sit-stand')

  await expect(page.getByText('Sit / Stand — Sitting')).toBeVisible()

  await close(app)
})

test('stops pushing updates once the window is closed', async () => {
  const app = await launch()
  await startPreset(app, 'pomodoro')

  const page = await openSettings(app)
  expect(await subscriberCount(app)).toBe(1)

  await page.close()
  await expect.poll(() => subscriberCount(app), { timeout: 5_000 }).toBe(0)

  // Reopening must not leave the old window behind as a second subscriber.
  const reopened = await openSettings(app)
  await expect(countdown(reopened)).toHaveText(/^2[45]:\d\d$/)
  expect(await subscriberCount(app)).toBe(1)

  await close(app)
})
