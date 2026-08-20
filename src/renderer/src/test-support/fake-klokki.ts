import { vi, type Mock } from 'vitest'
import type { HistoryStats } from '../../../shared/history'
import type { KlokkiApi } from '../../../shared/ipc'
import type { Preset } from '../../../shared/preset'
import type { ReminderView } from '../../../shared/reminder'
// One owner, shared with the main-process suite: see src/shared/test-support.
import { IDLE_VIEW } from '../../../shared/test-support/timer-view'
import type { TimerView } from '../../../shared/timer'

export { IDLE_VIEW, runningView } from '../../../shared/test-support/timer-view'

/** Fixed, so a test never depends on the day it runs on. */
export const TODAY = '2026-08-20'

export const emptyStats: HistoryStats = {
  today: { date: TODAY, completed: 0, minutesByLabel: [] },
  days: [{ date: TODAY, completed: 0, minutesByLabel: [] }],
}

type Mocked = { readonly [K in keyof KlokkiApi]: Mock<KlokkiApi[K]> }

export type FakeKlokki = Mocked & {
  /** Pushes a view the way the main process would, once a second. */
  readonly pushTimerView: (view: TimerView) => void
  /** Pushes the saved list, the way the store does after a save. */
  readonly pushPresets: (presets: readonly Preset[]) => void
  /** Announces a line written to the log. */
  readonly pushHistoryChanged: () => void
  /** Pushes the saved reminder list, the way the store does after a save. */
  readonly pushReminders: (reminders: readonly ReminderView[]) => void
  /** How many listeners are still registered — unmount should leave none. */
  readonly listenerCount: () => number
}

/**
 * The bridge, faked once.
 *
 * The renderer's whole interface is `KlokkiApi` (see src/shared/ipc.ts), so a test
 * that re-declares part of it — or casts past it — can drift from the real
 * contract without failing. This is typed against `KlokkiApi` itself: adding a
 * method to the bridge breaks this file, which is the only place it has to be
 * answered.
 *
 * The three `on…` channels are wired to the push helpers rather than to `vi.fn()`
 * stubs, so a test drives a view the way main does instead of reaching for the
 * listener the component registered.
 */
export const fakeKlokki = (overrides: Partial<KlokkiApi> = {}): FakeKlokki => {
  const views = new Set<(view: TimerView) => void>()
  const presets = new Set<(presets: readonly Preset[]) => void>()
  const history = new Set<() => void>()
  const reminders = new Set<(reminders: readonly ReminderView[]) => void>()

  const subscriber =
    <T>(set: Set<T>) =>
    (listener: T) => {
      set.add(listener)
      return () => {
        set.delete(listener)
      }
    }

  const defaults: KlokkiApi = {
    getAppInfo: () => Promise.resolve({ version: '0.0.0', electron: '43.0.0' }),
    listPresets: () => Promise.resolve([]),
    getTimerView: () => Promise.resolve(IDLE_VIEW),
    getStats: () => Promise.resolve(emptyStats),
    startPreset: () => Promise.resolve(),
    stopTimer: () => Promise.resolve(),
    skipPhase: () => Promise.resolve(true),
    setRemaining: () => Promise.resolve(true),
    addTime: () => Promise.resolve(true),
    dismissAlert: () => Promise.resolve(),
    snoozeAlert: () => Promise.resolve(true),
    savePreset: () => Promise.resolve({ ok: true }),
    deletePreset: () => Promise.resolve(),
    getLaunchAtLogin: () => Promise.resolve(false),
    setLaunchAtLogin: (enabled) => Promise.resolve(enabled),
    listReminders: () => Promise.resolve([]),
    saveReminder: () => Promise.resolve({ ok: true }),
    deleteReminder: () => Promise.resolve(),
    setReminderEnabled: () => Promise.resolve(),
    snoozeReminder: () => Promise.resolve(true),
    completeReminder: () => Promise.resolve(),
    onTimerView: subscriber(views),
    onPresets: subscriber(presets),
    onHistoryChanged: subscriber(history),
    onReminders: subscriber(reminders),
  }

  const api = Object.fromEntries(
    Object.entries({ ...defaults, ...overrides }).map(([name, method]) => [
      name,
      vi.fn(method as (...args: never[]) => unknown),
    ]),
  ) as unknown as Mocked

  const fake: FakeKlokki = Object.assign(api, {
    pushTimerView: (view: TimerView) => {
      for (const listener of views) listener(view)
    },
    pushPresets: (next: readonly Preset[]) => {
      for (const listener of presets) listener(next)
    },
    pushHistoryChanged: () => {
      for (const listener of history) listener()
    },
    pushReminders: (next: readonly ReminderView[]) => {
      for (const listener of reminders) listener(next)
    },
    listenerCount: () =>
      views.size + presets.size + history.size + reminders.size,
  })

  window.klokki = fake
  return fake
}
