import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ENTRY = fileURLToPath(
  new URL('../out/main/index.js', import.meta.url),
)

/** Mirrors the seam installed by src/main/index.ts under KLOKKI_E2E=1. */
type TestSeam = {
  trayTitle: () => string
  view: () => { running: boolean; phaseLabel: string | null; countdown: string }
  startPreset: (id: string) => void
  stop: () => void
}

type SeamHost = { __klokkiTest: TestSeam }

/**
 * Each test gets its own user-data directory. Klokki holds a single-instance
 * lock keyed on that directory, so without this a test launching while the
 * previous app is still shutting down would lose the lock and exit.
 */
const launch = async (
  seed?: (userDataDir: string) => void,
): Promise<ElectronApplication & { userDataDir: string }> => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'klokki-e2e-'))
  seed?.(userDataDir)

  const app = await electron.launch({
    args: [APP_ENTRY, `--user-data-dir=${userDataDir}`],
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
const trayTitle = (app: ElectronApplication): Promise<string> =>
  app.evaluate(() =>
    (globalThis as unknown as SeamHost).__klokkiTest.trayTitle(),
  )

const phaseLabel = (app: ElectronApplication): Promise<string | null> =>
  app.evaluate(
    () => (globalThis as unknown as SeamHost).__klokkiTest.view().phaseLabel,
  )

const isRunning = (app: ElectronApplication): Promise<boolean> =>
  app.evaluate(
    () => (globalThis as unknown as SeamHost).__klokkiTest.view().running,
  )

const startPreset = (app: ElectronApplication, id: string): Promise<void> =>
  app.evaluate(
    (_electron, presetId) =>
      (globalThis as unknown as SeamHost).__klokkiTest.startPreset(presetId),
    id,
  )

const stop = (app: ElectronApplication): Promise<void> =>
  app.evaluate(() => (globalThis as unknown as SeamHost).__klokkiTest.stop())

test('@smoke starts as a menubar-only app with an idle tray', async () => {
  const app = await launch()

  expect(
    await app.evaluate(({ app: electronApp }) => electronApp.dock?.isVisible()),
  ).toBe(false)
  expect(await trayTitle(app)).toBe('')

  await app.close()
})

test('@smoke shows a live countdown in the menubar once a preset starts', async () => {
  const app = await launch()

  await startPreset(app, 'pomodoro')
  expect(await trayTitle(app)).toMatch(/^\s*25:00$/)

  // The poll interval is 1s; the title must move on its own, with no window open.
  await expect
    .poll(() => trayTitle(app), { timeout: 5_000 })
    .toMatch(/^\s*24:5\d$/)

  expect(await phaseLabel(app)).toBe('Focus')

  await app.close()
})

test('stopping clears the menubar countdown', async () => {
  const app = await launch()

  await startPreset(app, 'sit-stand')
  expect(await trayTitle(app)).toMatch(/30:00/)

  await stop(app)

  expect(await trayTitle(app)).toBe('')
  expect(await isRunning(app)).toBe(false)

  await app.close()
})

test('seeds presets.json on first launch', async () => {
  const app = await launch()

  const file = join(app.userDataDir, 'presets.json')
  expect(existsSync(file)).toBe(true)
  expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({
    schemaVersion: 1,
    presets: [{ id: 'pomodoro' }, { id: 'sit-stand' }],
  })

  await app.close()
})

test('runs a preset added by hand-editing presets.json', async () => {
  const app = await launch((dir) =>
    writeFileSync(
      join(dir, 'presets.json'),
      JSON.stringify({
        schemaVersion: 1,
        presets: [
          {
            id: 'tea',
            name: 'Tea',
            loop: false,
            phases: [{ label: 'Steep', minutes: 3, notify: true }],
          },
        ],
      }),
    ),
  )

  await startPreset(app, 'tea')

  expect(await trayTitle(app)).toMatch(/^\s*03:00$/)
  expect(await phaseLabel(app)).toBe('Steep')

  // The seeds are gone: the file, not the constant, is the source of presets.
  await startPreset(app, 'pomodoro')
  expect(await phaseLabel(app)).toBe('Steep')

  await app.close()
})
