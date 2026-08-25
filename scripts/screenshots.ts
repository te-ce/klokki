// Captures the screenshots the README shows:
//
//   pnpm build && pnpm screenshots
//
// The app is the only honest source for them, so this launches the real bundle
// in out/ the way the e2e suite does — same seam, same throwaway user-data dir —
// seeds a week of history that makes every pane worth looking at, and writes
// PNGs into docs/screenshots/.
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Page } from '@playwright/test'
import {
  clickMenuItem,
  close,
  launch,
  startPreset,
  type KlokkiApp,
} from '../e2e/harness.ts'
import type { HistoryEvent } from '../src/shared/history.ts'
import type { ReminderHistoryEvent } from '../src/shared/reminder-history.ts'
import type { SportsHistoryEvent } from '../src/shared/sports-history.ts'
import type { ReminderDefinition } from '../src/shared/reminder.ts'
import type { SportSettings } from '../src/shared/sport.ts'

const ROOT = resolve(import.meta.dirname, '..')
const OUT_DIR = join(ROOT, 'docs/screenshots')

/**
 * The README is read on screens that have the pixels for it, and a 1x capture
 * of a 520pt window is soft everywhere it is shown.
 */
const RETINA = ['--force-device-scale-factor=2']

const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

/**
 * A fixed hour of the day, so a run at 09:00 and a run at midnight seed the
 * same week and the images differ only where the app does.
 */
const atHour = (daysAgo: number, hour: number): number => {
  const day = new Date(Date.now() - daysAgo * DAY_MS)
  day.setHours(hour, 0, 0, 0)
  return day.getTime()
}

/** Minutes per weekday, oldest last, so no two rows of the week bar are alike. */
const WEEK = [4, 7, 6, 8, 3, 9, 5]

const phaseEvents = (): readonly HistoryEvent[] =>
  WEEK.flatMap((rounds, daysAgo) =>
    Array.from({ length: rounds }, (_, round): readonly HistoryEvent[] => [
      {
        endedAt: atHour(daysAgo, 9 + round) + 25 * MINUTE_MS,
        presetId: 'pomodoro',
        phaseLabel: 'Focus',
        durationMs: 25 * MINUTE_MS,
        outcome: 'completed',
      },
      {
        endedAt: atHour(daysAgo, 9 + round) + 30 * MINUTE_MS,
        presetId: 'pomodoro',
        phaseLabel: 'Break',
        durationMs: 5 * MINUTE_MS,
        outcome: round % 3 === 0 ? 'snoozed' : 'completed',
      },
    ]).flat(),
  )

const reminderEvents = (): readonly ReminderHistoryEvent[] =>
  WEEK.flatMap((rounds, daysAgo) =>
    Array.from({ length: rounds }, (_, round): ReminderHistoryEvent => ({
      loggedAt: atHour(daysAgo, 9 + round) + 20 * MINUTE_MS,
      reminderId: 'eyes',
      stepLabel: 'Look 20ft away',
      quantity: null,
      outcome: 'done',
    })),
  )

const sportsEvents = (): readonly SportsHistoryEvent[] =>
  WEEK.flatMap((rounds, daysAgo) =>
    Array.from({ length: Math.max(1, rounds - 2) }, (_, round) =>
      [
        { activityId: 'pushups', activityLabel: 'Pushups', quantity: 10 },
        { activityId: 'squats', activityLabel: 'Squats', quantity: 15 },
        { activityId: 'situps', activityLabel: 'Situps', quantity: 20 },
      ].map((activity): SportsHistoryEvent => ({
        ...activity,
        loggedAt: atHour(daysAgo, 10 + round),
      })),
    ).flat(),
  )

const REMINDERS: readonly ReminderDefinition[] = [
  {
    id: 'eyes',
    name: 'Eyes',
    intervalMinutes: 20,
    steps: [
      { label: 'Look 20ft away' },
      { label: 'Blink slowly', unit: 'reps' },
    ],
    enabled: true,
  },
  {
    id: 'water',
    name: 'Water',
    intervalMinutes: 45,
    steps: [{ label: 'Drink a glass', unit: 'glasses' }],
    enabled: false,
  },
]

const SPORTS: SportSettings = {
  intervalMinutes: 60,
  activities: [
    { id: 'situps', name: 'Situps' },
    { id: 'squats', name: 'Squats' },
    { id: 'pushups', name: 'Pushups' },
  ],
  enabled: true,
}

const jsonl = (events: readonly unknown[]): string =>
  events.map((event) => `${JSON.stringify(event)}\n`).join('')

/**
 * Presets are left to seed themselves: Pomodoro and sit/stand are what a first
 * launch really has, which is what the Presets pane should be showing.
 */
const seed = (dir: string): void => {
  writeFileSync(join(dir, 'history.jsonl'), jsonl(phaseEvents()), 'utf8')
  writeFileSync(
    join(dir, 'reminders-history.jsonl'),
    jsonl(reminderEvents()),
    'utf8',
  )
  writeFileSync(
    join(dir, 'sports-history.jsonl'),
    jsonl(sportsEvents()),
    'utf8',
  )
  writeFileSync(
    join(dir, 'reminders.json'),
    `${JSON.stringify({ schemaVersion: 1, reminders: REMINDERS }, null, 2)}\n`,
    'utf8',
  )
  writeFileSync(
    join(dir, 'sports.json'),
    `${JSON.stringify({ schemaVersion: 1, settings: SPORTS }, null, 2)}\n`,
    'utf8',
  )
}

/**
 * KLOKKI_E2E=1 keeps windows unshown so the suite never steals focus, and an
 * unshown window has nothing to capture. Screenshots want the opposite, so they
 * are shown here — without focus, which is as much as a capture needs.
 */
const show = (app: KlokkiApp): Promise<void> =>
  app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) window.showInactive()
  })

const shoot = async (page: Page, name: string): Promise<void> => {
  await page.screenshot({
    path: join(OUT_DIR, `${name}.png`),
    scale: 'device',
  })
  console.warn(`wrote docs/screenshots/${name}.png`)
}

/**
 * The panes worth a picture, in rail order. Presets is shown with a preset
 * opened: the list says what a preset is called, the editor says what one is.
 */
const PANES: readonly { pane: string; open?: string }[] = [
  { pane: 'Timer' },
  { pane: 'Presets', open: 'Pomodoro' },
  { pane: 'Reminders' },
  { pane: 'Sports' },
  { pane: 'Stats' },
]

/** Every pane, with a Pomodoro running so the Timer pane has a countdown. */
const settingsPanes = async (): Promise<void> => {
  const app = await launch(seed, RETINA)
  await startPreset(app, 'pomodoro')

  const opening = app.waitForEvent('window')
  void clickMenuItem(app, 'Settings…')
  const page = await opening
  await page.waitForLoadState('domcontentloaded')
  await show(app)

  for (const { pane, open } of PANES) {
    await page.getByRole('button', { name: pane, exact: true }).click()
    // The pane subscribes on mount; a moment later it is showing real values.
    await page.waitForTimeout(500)
    if (open) await page.getByRole('button', { name: open }).click()
    await shoot(page, pane.toLowerCase())
  }

  await close(app)
}

/** The overlay, raised by a phase short enough to end while this runs. */
const overlay = async (): Promise<void> => {
  const app = await launch((dir) => {
    seed(dir)
    writeFileSync(
      join(dir, 'presets.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          presets: [
            {
              id: 'pomodoro',
              name: 'Pomodoro',
              loop: true,
              phases: [
                { label: 'Focus', minutes: 0.02, notify: true },
                { label: 'Break', minutes: 5, notify: true },
              ],
            },
          ],
        },
        null,
        2,
      )}\n`,
      'utf8',
    )
  }, RETINA)

  const opening = app.waitForEvent('window')
  void startPreset(app, 'pomodoro')
  const page = await opening
  await page.waitForLoadState('domcontentloaded')
  await show(app)
  await page.getByTestId('transition-overlay').waitFor()
  await shoot(page, 'overlay')

  await close(app)
}

await settingsPanes()
await overlay()
