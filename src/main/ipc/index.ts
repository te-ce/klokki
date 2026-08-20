import { IPC, type AppInfo } from '../../shared/ipc'
import type { Phase, Preset } from '../../shared/preset'
import { isReminderDefinition } from '../../shared/reminder'
import type { History } from '../history'
import type { LoginItem } from '../login-item'
import { startPresetById } from '../presets/start'
import type { PresetStore } from '../presets/store'
import type { ReminderStore } from '../reminders/store'
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

export type IpcDeps = {
  readonly requests: RequestSink
  readonly service: TimerService
  readonly store: PresetStore
  readonly loginItem: LoginItem
  readonly history: History
  readonly overlay: OverlayControl
  readonly reminderStore: ReminderStore
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
    overlay,
    reminderStore,
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
    startPreset: (id) =>
      startPresetById(service, store, expect(id, isString, 'a preset id')),
    savePreset: (preset) => store.save(expect(preset, isPreset, 'a preset')),
    deletePreset: (id) => store.remove(expect(id, isString, 'a preset id')),
    getLaunchAtLogin: () => loginItem.isEnabled(),
    setLaunchAtLogin: (enabled) =>
      loginItem.setEnabled(expect(enabled, isBoolean, 'a boolean')),
    stopTimer: () => service.stop(),
    skipPhase: () => service.skip(),
    setRemaining: (targetMs) =>
      service.setRemaining(expect(targetMs, isNumber, 'a duration in ms')),
    addTime: (extraMs) =>
      service.addTime(expect(extraMs, isNumber, 'a duration in ms')),
    dismissAlert: () => overlay.close(),
    // The overlay closes whether or not the boundary moved: a snooze is declined
    // only when its new end has already gone by, and leaving an overlay up that
    // names a boundary long past is worse than closing it. The renderer is told
    // which of the two happened rather than being left to assume the first.
    snoozeAlert: () => {
      const snoozed = service.snooze()
      overlay.close()
      return snoozed
    },
    listReminders: () => reminderStore.list(),
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
  }

  for (const [name, handler] of Object.entries(handlers))
    requests.handle(channelFor(name), handler)
}
