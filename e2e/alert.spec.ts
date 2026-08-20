import { expect, test, type Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  close,
  dockVisible,
  launch,
  overlay,
  phaseLabel,
  remaining,
  startPreset,
  type KlokkiApp,
} from './harness'

/**
 * A phase short enough for a test to sit through. Minutes are fractional on
 * disk, which is what makes a real transition — poll timer, wall clock, drain
 * and all — observable inside a test timeout instead of 25 minutes later.
 */
const BLINK = 0.02

const seedBlink = (notify: boolean) => (userDataDir: string) => {
  writeFileSync(
    join(userDataDir, 'presets.json'),
    JSON.stringify({
      schemaVersion: 1,
      presets: [
        {
          id: 'blink',
          name: 'Blink',
          loop: true,
          phases: [
            { label: 'Tick', minutes: BLINK, notify },
            { label: 'Tock', minutes: 5, notify: true },
          ],
        },
      ],
    }),
    'utf8',
  )
}

const overlayPage = async (app: KlokkiApp): Promise<Page> => {
  const opening = app.waitForEvent('window')
  await startPreset(app, 'blink')
  const page = await opening
  await page.waitForLoadState('domcontentloaded')
  return page
}

test('@smoke a phase ending raises an overlay that waits to be acknowledged', async () => {
  const app = await launch(seedBlink(true))

  const page = await overlayPage(app)

  await expect(page.getByTestId('transition-overlay')).toBeVisible()
  await expect(page.getByText('Tick finished')).toBeVisible()
  await expect(page.getByText('Tock')).toBeVisible()

  // Still there a few seconds later: acknowledgement is the only way out.
  await page.waitForTimeout(3_000)
  expect(await overlay(app)).toMatchObject({ open: true })

  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect.poll(() => overlay(app), { timeout: 5_000 }).toBeNull()

  await close(app)
})

test('the overlay sits above fullscreen apps without taking focus', async () => {
  const app = await launch(seedBlink(true))

  await overlayPage(app)

  expect(await overlay(app)).toEqual({
    open: true,
    // 'screen-saver' level: the only one that clears a fullscreen window.
    alwaysOnTop: true,
    // Keystrokes keep going to whatever the user was typing in.
    focusable: false,
    // On the active Space, not the one the overlay was created on.
    visibleOnAllWorkspaces: true,
  })
  // An overlay must not turn a menubar app into a Dock and app-switcher entry.
  expect(await dockVisible(app)).toBe(false)

  await close(app)
})

test('a phase with notify unset ends without an overlay', async () => {
  const app = await launch(seedBlink(false))

  await startPreset(app, 'blink')
  // Long enough for the phase to end and two more polls to run.
  await new Promise((resolve) => setTimeout(resolve, 4_000))

  expect(await overlay(app)).toBeNull()

  await close(app)
})

test('snoozing buys five more minutes of the phase that just ended', async () => {
  const app = await launch(seedBlink(true))

  const page = await overlayPage(app)
  await page.getByRole('button', { name: 'Snooze 5 minutes' }).click()
  await expect.poll(() => overlay(app), { timeout: 5_000 }).toBeNull()

  // Back in Tick, with the snooze on the menubar countdown — Tock has not
  // started, and when it does it will still be its full five minutes.
  expect(await phaseLabel(app)).toBe('Tick')
  expect(await remaining(app)).toBeGreaterThan(4 * 60_000)

  await close(app)
})
