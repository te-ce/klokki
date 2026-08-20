import { expect, test, type Page } from '@playwright/test'
import {
  clickMenuItem,
  close,
  launch,
  menuLabels,
  type KlokkiApp,
} from './harness'

const openSettings = async (app: KlokkiApp): Promise<Page> => {
  const opening = app.waitForEvent('window')
  expect(await clickMenuItem(app, 'Settings…')).toBe(true)
  const page = await opening
  await page.waitForLoadState('domcontentloaded')
  return page
}

test('@smoke a renamed preset reaches the menubar without a relaunch', async () => {
  const app = await launch()
  const page = await openSettings(app)

  await page.getByRole('button', { name: 'Edit Pomodoro' }).click()
  await page.getByLabel('Preset name').fill('Deep work')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect
    .poll(() => menuLabels(app), { timeout: 5_000 })
    .toContain('Start Deep work')

  await close(app)
})

test('a new preset can be created and started from the menubar', async () => {
  const app = await launch()
  const page = await openSettings(app)

  await page.getByRole('button', { name: 'New preset' }).click()
  await page.getByLabel('Preset name').fill('Stretch')
  await page.getByLabel('Phase 1 label').fill('Move')
  await page.getByLabel('Phase 1 minutes').fill('2')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect
    .poll(() => menuLabels(app), { timeout: 5_000 })
    .toContain('Start Stretch')
  expect(await clickMenuItem(app, 'Start Stretch')).toBe(true)
  await expect(page.getByText('Stretch — Move')).toBeVisible()

  await close(app)
})

// The window that made the edit is the one most likely to be showing a stale
// list: the tray rebuilds from the store, but a view that read the list on mount
// would still be offering yesterday's presets beside the editor that changed them.
test('a preset created in the editor is offered by the panel above it', async () => {
  const app = await launch()
  const page = await openSettings(app)

  await page.getByRole('button', { name: 'New preset' }).click()
  await page.getByLabel('Preset name').fill('Stretch')
  await page.getByLabel('Phase 1 label').fill('Move')
  await page.getByLabel('Phase 1 minutes').fill('2')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(
    page.getByRole('button', { name: 'Start Stretch' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Edit Pomodoro' }).click()
  await page.getByLabel('Preset name').fill('Deep work')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(
    page.getByRole('button', { name: 'Start Deep work' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Start Pomodoro' }),
  ).toBeHidden()

  await close(app)
})

test('a deleted preset leaves the menubar', async () => {
  const app = await launch()
  const page = await openSettings(app)

  await page.getByRole('button', { name: 'Edit Sit / Stand' }).click()
  await page.getByRole('button', { name: 'Delete preset' }).click()

  await expect
    .poll(() => menuLabels(app), { timeout: 5_000 })
    .not.toContain('Start Sit / Stand')

  await close(app)
})

test('an unrunnable preset is refused with a reason and never saved', async () => {
  const app = await launch()
  const page = await openSettings(app)

  await page.getByRole('button', { name: 'Edit Pomodoro' }).click()
  await page.getByLabel('Phase 1 minutes').fill('0')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(
    page.getByText('Phase 1 needs to be longer than zero minutes.'),
  ).toBeVisible()
  expect(await menuLabels(app)).toContain('Start Pomodoro')

  await close(app)
})
