import {
  _electron as electron,
  expect,
  type ElectronApplication,
} from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ENTRY = fileURLToPath(
  new URL('../out/main/index.js', import.meta.url),
)

/** Mirrors the seam installed by src/main/index.ts under KLOKKI_E2E=1. */
type TestSeam = {
  trayTitle: () => string
  clickMenuItem: (label: string) => boolean
  menuLabels: () => string[]
  view: () => {
    running: boolean
    phaseLabel: string | null
    countdown: string
    remainingMs: number
  }
  startPreset: (id: string) => void
  stop: () => void
  subscriberCount: () => number
  overlay: () => OverlayState | null
}

/** What the main process can tell us about the transition overlay. */
export type OverlayState = {
  open: boolean
  alwaysOnTop: boolean
  focusable: boolean
  visibleOnAllWorkspaces: boolean
}

type SeamHost = { __klokkiTest: TestSeam }

export type KlokkiApp = ElectronApplication & { userDataDir: string }

/**
 * Each test gets its own user-data directory. Klokki holds a single-instance
 * lock keyed on that directory, so without this a test launching while the
 * previous app is still shutting down would lose the lock and exit.
 */
export const launch = async (
  seed?: (userDataDir: string) => void,
  /** Extra Chromium switches; the screenshot script asks for a retina scale. */
  extraArgs: readonly string[] = [],
): Promise<KlokkiApp> => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'klokki-e2e-'))
  seed?.(userDataDir)

  const app = await electron.launch({
    args: [APP_ENTRY, `--user-data-dir=${userDataDir}`, ...extraArgs],
    env: { ...process.env, KLOKKI_E2E: '1' },
  })

  // electron.launch() resolves as soon as the process is up, which is before
  // app.whenReady() has built the tray and installed the seam. Without waiting,
  // whether a test sees the seam depends on how long its first call happens to
  // take — an order-dependent flake.
  await expect
    .poll(
      () =>
        app.evaluate(() =>
          Boolean((globalThis as unknown as Partial<SeamHost>).__klokkiTest),
        ),
      { timeout: 10_000 },
    )
    .toBe(true)

  return Object.assign(app, { userDataDir })
}

// These run inside the app's main process, which is the only place the menubar
// is observable at all.
export const trayTitle = (app: ElectronApplication): Promise<string> =>
  app.evaluate(() =>
    (globalThis as unknown as SeamHost).__klokkiTest.trayTitle(),
  )

export const phaseLabel = (app: ElectronApplication): Promise<string | null> =>
  app.evaluate(
    () => (globalThis as unknown as SeamHost).__klokkiTest.view().phaseLabel,
  )

export const remaining = (app: ElectronApplication): Promise<number> =>
  app.evaluate(
    () => (globalThis as unknown as SeamHost).__klokkiTest.view().remainingMs,
  )

export const isRunning = (app: ElectronApplication): Promise<boolean> =>
  app.evaluate(
    () => (globalThis as unknown as SeamHost).__klokkiTest.view().running,
  )

export const startPreset = (
  app: ElectronApplication,
  id: string,
): Promise<void> =>
  app.evaluate(
    (_electron, presetId) =>
      (globalThis as unknown as SeamHost).__klokkiTest.startPreset(presetId),
    id,
  )

export const stop = (app: ElectronApplication): Promise<void> =>
  app.evaluate(() => (globalThis as unknown as SeamHost).__klokkiTest.stop())

/** Clicks a real item in the tray's context menu, by label. */
export const clickMenuItem = (
  app: ElectronApplication,
  label: string,
): Promise<boolean> =>
  app.evaluate(
    (_electron, itemLabel) =>
      (globalThis as unknown as SeamHost).__klokkiTest.clickMenuItem(itemLabel),
    label,
  )

/** The tray menu as the user would read it. */
export const menuLabels = (app: ElectronApplication): Promise<string[]> =>
  app.evaluate(() =>
    (globalThis as unknown as SeamHost).__klokkiTest.menuLabels(),
  )

/** How many windows the main process is currently pushing updates to. */
export const subscriberCount = (app: ElectronApplication): Promise<number> =>
  app.evaluate(() =>
    (globalThis as unknown as SeamHost).__klokkiTest.subscriberCount(),
  )

/**
 * The overlay as the main process sees it. Its platform configuration *is* the
 * feature — appearing above fullscreen without stealing focus — and none of it
 * is observable from the renderer side.
 */
export const overlay = (
  app: ElectronApplication,
): Promise<OverlayState | null> =>
  app.evaluate(() => (globalThis as unknown as SeamHost).__klokkiTest.overlay())

/** Whether Klokki is showing in the Dock, which a menubar app never should. */
export const dockVisible = (app: ElectronApplication): Promise<boolean> =>
  app.evaluate(({ app: electronApp }) => electronApp.dock?.isVisible() ?? false)

/**
 * Quits from inside the app. `app.close()` closes the windows and then waits for
 * the process to exit, which never happens here: Klokki deliberately survives
 * having no windows (it is a menubar app), so only an explicit quit ends it.
 */
export const close = async (app: ElectronApplication): Promise<void> => {
  const closed = app.waitForEvent('close')
  await app.evaluate(({ app: electronApp }) => electronApp.quit())
  await closed
}
