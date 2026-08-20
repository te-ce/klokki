import { IPC, type AppInfo } from '../../shared/ipc'
import type { Preset } from '../../shared/preset'
import type { History } from '../history'
import type { LoginItem } from '../login-item'
import { startPresetById } from '../presets/start'
import type { PresetStore } from '../presets/store'
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

/** The main side of src/shared/ipc.ts. Every renderer capability lands here. */
export const registerIpc = (deps: IpcDeps): void => {
  const { requests, service, store, loginItem, history, overlay } = deps

  const handlers: Handlers = {
    getAppInfo: deps.appInfo,
    // The store is read per call, not captured: a window that has been open
    // across an edit must not be answered from a stale list.
    listPresets: () => store.list(),
    getTimerView: () => service.getView(),
    // Summarised per call, from the log's tail: the window is open rarely and a
    // cached summary would be wrong the moment a phase ended behind it.
    getStats: () => history.stats(),
    startPreset: (id) => startPresetById(service, store, id as string),
    savePreset: (preset) => store.save(preset as Preset),
    deletePreset: (id) => store.remove(id as string),
    getLaunchAtLogin: () => loginItem.isEnabled(),
    setLaunchAtLogin: (enabled) => loginItem.setEnabled(enabled as boolean),
    stopTimer: () => service.stop(),
    skipPhase: () => service.skip(),
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
  }

  for (const [name, handler] of Object.entries(handlers))
    requests.handle(IPC[name as keyof typeof IPC], handler)
}
