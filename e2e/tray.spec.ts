import { expect, test } from '@playwright/test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  clickMenuItem,
  close,
  isRunning,
  launch,
  menuLabels,
  phaseLabel,
  runs,
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
  // The phase is in the title, not only the number: a glance at the menubar has
  // to say whether the user should be sitting or standing.
  expect(await trayTitle(app)).toMatch(/^\s*Focus 25:00$/)

  // The poll interval is 1s; the title must move on its own, with no window open.
  await expect
    .poll(() => trayTitle(app), { timeout: 5_000 })
    .toMatch(/^\s*Focus 24:5\d$/)

  expect(await phaseLabel(app)).toBe('Focus')

  await close(app)
})

test('stopping clears the menubar countdown', async () => {
  const app = await launch()

  await startPreset(app, 'sit-stand')
  expect(await trayTitle(app)).toMatch(/30:00/)

  await stop(app, 'sit-stand')

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

  expect(await trayTitle(app)).toMatch(/^\s*Steep 03:00$/)
  expect(await phaseLabel(app)).toBe('Steep')

  // The seeds are gone: the file, not the constant, is the source of presets.
  await startPreset(app, 'pomodoro')
  expect(await phaseLabel(app)).toBe('Steep')

  await close(app)
})

test('@smoke skips to the next phase from the tray menu', async () => {
  const app = await launch()

  await startPreset(app, 'sit-stand')
  expect(await phaseLabel(app)).toBe('Sitting')

  expect(await clickMenuItem(app, 'Skip to Standing · Sit / Stand')).toBe(true)

  expect(await phaseLabel(app)).toBe('Standing')
  // Standing runs its full fifteen minutes, starting now.
  expect(await trayTitle(app)).toMatch(/^\s*Standing 15:00$/)

  await close(app)
})

/**
 * A reminder with an interval no test would sit through: the point here is that
 * the tray can start it at all, and that the item names what clicking it does.
 */
const seedReminder = (enabled: boolean) => (userDataDir: string) => {
  writeFileSync(
    join(userDataDir, 'reminders.json'),
    JSON.stringify({
      schemaVersion: 1,
      reminders: [
        {
          id: 'water',
          name: 'Drink water',
          intervalMinutes: 30,
          steps: [{ label: 'Drink a glass of water' }],
          enabled,
        },
      ],
    }),
    'utf8',
  )
}

test('@smoke starts a reminder from the tray menu', async () => {
  const app = await launch(seedReminder(false))

  // Off, so it offers to start it; the heading keeps it apart from the presets.
  expect(await menuLabels(app)).toContain('Reminders')
  expect(await menuLabels(app)).toContain('Start Drink water')

  expect(await clickMenuItem(app, 'Start Drink water')).toBe(true)

  // Scheduled now, which is what turns the item into a restart — and enabled in
  // the file, so a relaunch keeps it.
  await expect
    .poll(() => menuLabels(app), { timeout: 5_000 })
    .toContain('Restart Drink water')
  expect(
    JSON.parse(readFileSync(join(app.userDataDir, 'reminders.json'), 'utf8')),
  ).toMatchObject({ reminders: [{ id: 'water', enabled: true }] })

  await close(app)
})

test('@smoke runs two presets at once and names both in the menubar', async () => {
  const app = await launch()

  await startPreset(app, 'pomodoro')
  await startPreset(app, 'sit-stand')

  // Both, joined — not one headline with the other hidden.
  expect(await trayTitle(app)).toMatch(/^\s*Focus 25:00 · Sitting 30:00$/)
  expect((await runs(app)).map((run) => run.runId)).toEqual([
    'pomodoro',
    'sit-stand',
  ])

  // A section each in the menu, every command naming the run it lands on.
  const labels = await menuLabels(app)
  expect(labels).toContain('Pomodoro — Focus')
  expect(labels).toContain('Sit / Stand — Sitting')
  expect(labels).toContain('Stop · Pomodoro')
  expect(labels).toContain('Stop · Sit / Stand')

  // Stopping one leaves the other counting, and the title says so.
  expect(await clickMenuItem(app, 'Stop · Pomodoro')).toBe(true)
  expect((await runs(app)).map((run) => run.runId)).toEqual(['sit-stand'])
  expect(await trayTitle(app)).toMatch(/^\s*Sitting \d\d:\d\d$/)

  await close(app)
})

test('restarting a running preset does not add a second copy of it', async () => {
  const app = await launch()

  await startPreset(app, 'pomodoro')
  await startPreset(app, 'sit-stand')
  await startPreset(app, 'pomodoro')

  // One run per preset, still in the order they were first started.
  expect((await runs(app)).map((run) => run.runId)).toEqual([
    'pomodoro',
    'sit-stand',
  ])

  await close(app)
})
