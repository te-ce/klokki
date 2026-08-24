import { IPC, type AppInfo } from '../../shared/ipc'
import type { Phase, Preset } from '../../shared/preset'
import { isReminderDefinition, type ReminderView } from '../../shared/reminder'
import { isSportSettings, type SportsView } from '../../shared/sport'
import type { History, ReminderHistory, SportsHistory } from '../history'
import type { LoginItem } from '../login-item'
import { startPresetById } from '../presets/start'
import type { PresetStore } from '../presets/store'
import type { ReminderStore } from '../reminders/store'
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

/** The transition overlay, as much of it as answering a renderer needs. */
export type OverlayControl = {
  readonly close: () => void
}

/** Answering the reminder overlay currently showing — see reminders/wire.ts. */
export type ReminderAnswers = {
  readonly snooze: (extraMs: number) => boolean
  readonly complete: (quantity: number | null) => void
}

/** Answering the Sports overlay currently showing — see sports/wire.ts. */
export type SportsAnswers = {
  readonly snooze: (extraMs: number) => boolean
  readonly confirm: (quantities: Readonly<Record<string, number>>) => void
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
  readonly overlay: OverlayControl
  readonly reminderStore: ReminderStore
  /** The reminder list joined with the engine's live schedule — see wire.ts. */
  readonly reminderViews: () => readonly ReminderView[]
  readonly reminderAnswers: ReminderAnswers
  readonly sportsHistory: SportsHistory
  readonly sportsStore: SportStore
  /** The Sports settings joined with the engine's live schedule — see wire.ts. */
  readonly sportsViews: () => SportsView
  readonly sportsAnswers: SportsAnswers
  readonly startSports: () => void
  readonly stopSports: () => void
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
    overlay,
    reminderStore,
    reminderViews,
    reminderAnswers,
    sportsHistory,
    sportsStore,
    sportsViews,
    sportsAnswers,
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
    stopTimer: () => service.stop(),
    skipPhase: () => service.skip(),
    confirmNext: () => service.confirm(),
    setRemaining: (targetMs) =>
      service.setRemaining(expect(targetMs, isNumber, 'a duration in ms')),
    addTime: (extraMs) =>
      service.addTime(expect(extraMs, isNumber, 'a duration in ms')),
    // Dismissing the overlay is the confirmation the waiting run is holding for:
    // the boundary was announced, the user answered it, and the phase it names
    // starts now. Closing without starting anything would leave the run parked.
    dismissAlert: () => {
      service.confirm()
      overlay.close()
    },
    // The overlay closes whether or not the boundary moved: a snooze is declined
    // only when its new end has already gone by, and leaving an overlay up that
    // names a boundary long past is worse than closing it. The renderer is told
    // which of the two happened rather than being left to assume the first.
    snoozeAlert: () => {
      const snoozed = service.snooze()
      overlay.close()
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
  }

  for (const [name, handler] of Object.entries(handlers))
    requests.handle(channelFor(name), handler)
}
