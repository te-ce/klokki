import { IPC, type AppInfo } from '../../shared/ipc'
import type { Phase, Preset } from '../../shared/preset'
import { isReminderDefinition, type ReminderView } from '../../shared/reminder'
import { isSportSettings, type SportsView } from '../../shared/sport'
import type { History, ReminderHistory, SportsHistory } from '../history'
import type { LoginItem } from '../login-item'
import { startPresetById } from '../presets/start'
import type { PresetStore } from '../presets/store'
import type { ReminderStore } from '../reminders/store'
import type { SportsService } from '../sports/service'
import type { SportStore } from '../sports/store'
import type { TimerService } from '../timer/service'

/**
 * Where a renderer's requests arrive. `ipcMain` in production (see sink.ts), a
 * recorder in the test — which is what makes the handlers below assertable
 * without an Electron app.
 */
export type RequestSink = {
  readonly handle: (
    channel: string,
    handler: (...args: readonly unknown[]) => unknown,
  ) => void
}

/**
 * An overlay window, as much of one as the app above it needs.
 *
 * Closing it is half of voiding the alert it belongs to — the other half is
 * withdrawing the notification, which is why `voidAlert` pairs it with the
 * surface rather than either one doing it alone (see alert/void.ts).
 */
export type OverlayControl = {
  readonly close: () => void
}

/** Answering the reminder overlay currently showing — see reminders/wire.ts. */
export type ReminderAnswers = {
  readonly snooze: (extraMs: number) => boolean
  readonly complete: (quantity: number | null) => void
  readonly stop: () => void
}

/** Answering the Sports overlay currently showing — see sports/wire.ts. */
export type SportsAnswers = {
  readonly snooze: (extraMs: number) => boolean
  readonly confirm: (quantities: Readonly<Record<string, number>>) => void
  readonly stop: () => void
}

/**
 * Logging Sports activity from the tab, independent of the overlay and the
 * running schedule — see wire.ts's `logSports` closure.
 */
export type SportsLog = (quantities: Readonly<Record<string, number>>) => void

export type IpcDeps = {
  readonly requests: RequestSink
  readonly service: TimerService
  readonly store: PresetStore
  readonly loginItem: LoginItem
  readonly history: History
  readonly reminderHistory: ReminderHistory
  readonly reminderStore: ReminderStore
  /** The reminder list joined with the engine's live schedule — see wire.ts. */
  readonly reminderViews: () => readonly ReminderView[]
  readonly reminderAnswers: ReminderAnswers
  readonly sportsHistory: SportsHistory
  readonly sportsStore: SportStore
  /** The Sports settings joined with the engine's live schedule — see wire.ts. */
  readonly sportsViews: () => SportsView
  readonly sportsAnswers: SportsAnswers
  readonly sportsService: SportsService
  readonly startSports: () => void
  readonly stopSports: () => void
  /**
   * Stopping one run, and voiding whatever alert it had raised. One closure in
   * wire.ts, shared with the tray and the notification's own Stop button, which
   * is why `stopTimer` and `stopFromAlert` are the same move on two channels: an
   * alert of a stopped run is void however the stop arrived.
   */
  readonly stopTimer: (runId: string) => void
  /**
   * A run's boundary has been answered — from anywhere. Voids that run's alert
   * and raises whichever boundary was queued behind it (see alert/wire.ts).
   *
   * It is a dependency rather than a call on `overlay` because answering is a
   * decision about a queue, not a window: an alert answered from the Timer pane
   * while a second run's overlay is up must leave that window alone.
   */
  readonly answerAlert: (runId: string) => void
  readonly logSports: SportsLog
  readonly appInfo: () => AppInfo
}

/**
 * One handler per request channel, keyed by the name in `IPC` rather than by the
 * channel string.
 *
 * A missing handler is a channel the renderer can call and nothing answers, which
 * surfaces as a hung promise rather than an error. Keying the table this way is
 * what turns that into a type error: the mapped type cannot be satisfied without
 * every channel, and a `PUSH` channel cannot appear in it at all.
 */
type Handlers = {
  readonly [K in keyof typeof IPC]: (...args: readonly unknown[]) => unknown
}

/**
 * Renderer arguments arrive as `unknown`, and this is a trust boundary: each is
 * narrowed rather than asserted, so a malformed call fails loudly here instead of
 * reaching the store or the timer as the wrong shape.
 */
const isPhase = (value: unknown): value is Phase =>
  typeof value === 'object' &&
  value !== null &&
  'label' in value &&
  typeof value.label === 'string' &&
  'minutes' in value &&
  typeof value.minutes === 'number' &&
  'notify' in value &&
  typeof value.notify === 'boolean'

/** A preset's own fields, checked apart from its phases. */
const hasPresetFields = (value: object): boolean =>
  'id' in value &&
  typeof value.id === 'string' &&
  'name' in value &&
  typeof value.name === 'string' &&
  'loop' in value &&
  typeof value.loop === 'boolean'

const isPreset = (value: unknown): value is Preset =>
  typeof value === 'object' &&
  value !== null &&
  hasPresetFields(value) &&
  'phases' in value &&
  Array.isArray(value.phases) &&
  value.phases.every(isPhase)

const expect = <T>(
  value: unknown,
  is: (candidate: unknown) => candidate is T,
  what: string,
): T => {
  if (!is(value)) throw new TypeError(`IPC: expected ${what}`)
  return value
}

const isString = (value: unknown): value is string => typeof value === 'string'
const isNumber = (value: unknown): value is number => typeof value === 'number'
const isBoolean = (value: unknown): value is boolean =>
  typeof value === 'boolean'
const isNumberOrNull = (value: unknown): value is number | null =>
  value === null || typeof value === 'number'

/** Quantities keyed by activity id, as the Sports overlay and tab both send them. */
const isQuantities = (
  value: unknown,
): value is Readonly<Record<string, number>> =>
  typeof value === 'object' &&
  value !== null &&
  Object.values(value).every((quantity) => typeof quantity === 'number')

/** The channel a handler name registers on. */
const channelFor = (name: string): string => {
  const channel: string | undefined = Object.hasOwn(IPC, name)
    ? Object.entries(IPC).find(([key]) => key === name)?.[1]
    : undefined
  if (channel === undefined) throw new Error(`IPC: no channel named ${name}`)
  return channel
}

/** The main side of src/shared/ipc.ts. Every renderer capability lands here. */
export const registerIpc = (deps: IpcDeps): void => {
  const {
    requests,
    service,
    store,
    loginItem,
    history,
    reminderHistory,
    reminderStore,
    reminderViews,
    reminderAnswers,
    sportsHistory,
    sportsStore,
    sportsViews,
    sportsAnswers,
    sportsService,
  } = deps

  const handlers: Handlers = {
    getAppInfo: deps.appInfo,
    // The store is read per call, not captured: a window that has been open
    // across an edit must not be answered from a stale list.
    listPresets: () => store.list(),
    getTimerView: () => service.getView(),
    // Summarised per call, from the log's tail: the window is open rarely and a
    // cached summary would be wrong the moment a phase ended behind it.
    getStats: () => history.stats(),
    getReminderStats: () => reminderHistory.stats(),
    startPreset: (id) =>
      startPresetById(service, store, expect(id, isString, 'a preset id')),
    savePreset: (preset) => store.save(expect(preset, isPreset, 'a preset')),
    deletePreset: (id) => store.remove(expect(id, isString, 'a preset id')),
    getLaunchAtLogin: () => loginItem.isEnabled(),
    setLaunchAtLogin: (enabled) =>
      loginItem.setEnabled(expect(enabled, isBoolean, 'a boolean')),
    stopTimer: (runId) => deps.stopTimer(expect(runId, isString, 'a run id')),
    // A boundary answered here is answered everywhere: skipping and confirming
    // both settle the run's boundary, so its overlay closes with them rather
    // than being left standing over a phase that has already started.
    skipPhase: (runId) => {
      const id = expect(runId, isString, 'a run id')
      const skipped = service.skip(id)
      deps.answerAlert(id)
      return skipped
    },
    confirmNext: (runId) => {
      const id = expect(runId, isString, 'a run id')
      const confirmed = service.confirm(id)
      deps.answerAlert(id)
      return confirmed
    },
    setRemaining: (runId, targetMs) =>
      service.setRemaining(
        expect(runId, isString, 'a run id'),
        expect(targetMs, isNumber, 'a duration in ms'),
      ),
    addTime: (runId, extraMs) =>
      service.addTime(
        expect(runId, isString, 'a run id'),
        expect(extraMs, isNumber, 'a duration in ms'),
      ),
    // Dismissing the overlay is the confirmation the waiting run is holding for:
    // the boundary was announced, the user answered it, and the phase it names
    // starts now. Closing without starting anything would leave the run parked.
    dismissAlert: (runId) => {
      const id = expect(runId, isString, 'a run id')
      service.confirm(id)
      deps.answerAlert(id)
    },
    // The run ends and the alert goes with it: a boundary belonging to a run
    // that no longer exists has nothing left to answer, and an overlay naming it
    // would be a window with no true way out. The same closure as `stopTimer`,
    // because that is now true of a stop from anywhere.
    stopFromAlert: (runId) =>
      deps.stopTimer(expect(runId, isString, 'a run id')),
    // The overlay closes whether or not the boundary moved: a snooze is declined
    // only when its new end has already gone by, and leaving an overlay up that
    // names a boundary long past is worse than closing it. The renderer is told
    // which of the two happened rather than being left to assume the first.
    snoozeAlert: (runId, extraMs) => {
      const id = expect(runId, isString, 'a run id')
      const snoozed = service.snooze(
        id,
        expect(extraMs, isNumber, 'a duration in ms'),
      )
      deps.answerAlert(id)
      return snoozed
    },
    listReminders: () => reminderViews(),
    saveReminder: (definition) =>
      reminderStore.save(
        expect(definition, isReminderDefinition, 'a reminder'),
      ),
    deleteReminder: (id) =>
      reminderStore.remove(expect(id, isString, 'a reminder id')),
    setReminderEnabled: (id, enabled) =>
      reminderStore.setEnabled(
        expect(id, isString, 'a reminder id'),
        expect(enabled, isBoolean, 'a boolean'),
      ),
    snoozeReminder: (extraMs) =>
      reminderAnswers.snooze(expect(extraMs, isNumber, 'a duration in ms')),
    completeReminder: (quantity) =>
      reminderAnswers.complete(
        expect(quantity, isNumberOrNull, 'a quantity or null'),
      ),
    // Which reminder is stopped is the controller's answer, not the renderer's:
    // the overlay stops the reminder it is showing (see reminders/wire.ts).
    stopReminderFromAlert: () => reminderAnswers.stop(),
    stopSportsFromAlert: () => sportsAnswers.stop(),
    getSportsStats: () => sportsHistory.stats(),
    getSportsSettings: () => sportsViews(),
    saveSportsSettings: (settings) =>
      sportsStore.save(expect(settings, isSportSettings, 'Sports settings')),
    startSports: () => deps.startSports(),
    stopSports: () => deps.stopSports(),
    snoozeSports: (extraMs) =>
      sportsAnswers.snooze(expect(extraMs, isNumber, 'a duration in ms')),
    confirmSports: (quantities) =>
      sportsAnswers.confirm(expect(quantities, isQuantities, 'quantities')),
    logSports: (quantities) =>
      deps.logSports(expect(quantities, isQuantities, 'quantities')),
    setRemainingSports: (targetMs) =>
      sportsService.setRemaining(
        expect(targetMs, isNumber, 'a duration in ms'),
      ),
    addTimeSports: (extraMs) =>
      sportsService.addTime(expect(extraMs, isNumber, 'a duration in ms')),
  }

  for (const [name, handler] of Object.entries(handlers))
    requests.handle(channelFor(name), handler)
}
