import { expect, test } from '@playwright/test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  close,
  isRunning,
  launch,
  phaseLabel,
  startPreset,
  stop,
  trayTitle,
} from './harness'

test('@smoke starts as a menubar-only app with an idle tray', async () => {
  const app = await launch()

  expect(
    await app.evaluate(({ app: electronApp }) => electronApp.dock?.isVisible()),
  ).toBe(false)
  expect(await trayTitle(app)).toBe('')

  await close(app)
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

  await close(app)
})

test('stopping clears the menubar countdown', async () => {
  const app = await launch()

  await startPreset(app, 'sit-stand')
  expect(await trayTitle(app)).toMatch(/30:00/)

  await stop(app)

  expect(await trayTitle(app)).toBe('')
  expect(await isRunning(app)).toBe(false)

  await close(app)
})

test('seeds presets.json on first launch', async () => {
  const app = await launch()

  const file = join(app.userDataDir, 'presets.json')
  expect(existsSync(file)).toBe(true)
  expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({
    schemaVersion: 1,
    presets: [{ id: 'pomodoro' }, { id: 'sit-stand' }],
  })

  await close(app)
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

  await close(app)
})
