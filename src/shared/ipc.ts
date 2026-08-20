/**
 * The single contract between main and renderer.
 *
 * The renderer is sandboxed and has no Node access (see AGENTS.md): everything it
 * knows about the app arrives through this interface, implemented in src/preload
 * and served by src/main.
 */

import type { Preset, SaveResult } from './preset'
import type { TimerView } from './timer'

export const IPC = {
  getAppInfo: 'klokki:get-app-info',
  listPresets: 'klokki:list-presets',
  getTimerView: 'klokki:get-timer-view',
  startPreset: 'klokki:start-preset',
  savePreset: 'klokki:save-preset',
  deletePreset: 'klokki:delete-preset',
  getLaunchAtLogin: 'klokki:get-launch-at-login',
  setLaunchAtLogin: 'klokki:set-launch-at-login',
  stopTimer: 'klokki:stop-timer',
  dismissAlert: 'klokki:dismiss-alert',
  snoozeAlert: 'klokki:snooze-alert',
  /** Main → renderer: a fresh view, once a second while the timer runs. */
  timerView: 'klokki:timer-view',
} as const

export type AppInfo = {
  version: string
  electron: string
}

export interface KlokkiApi {
  getAppInfo(): Promise<AppInfo>
  listPresets(): Promise<readonly Preset[]>
  /**
   * The current view, for a window that has just opened: waiting for the next
   * push would leave it blank for up to a second.
   */
  getTimerView(): Promise<TimerView>
  startPreset(id: string): Promise<void>
  stopTimer(): Promise<void>
  /** Closes the transition overlay. The only way out of it — it never times out. */
  dismissAlert(): Promise<void>
  /**
   * Defers the boundary the overlay is showing and closes it. The length of the
   * snooze is the main process's to decide (`SNOOZE_MS`): a renderer must not be
   * able to name an amount of time the timer then honours.
   */
  snoozeAlert(): Promise<void>
  /**
   * Upsert by id. The main process validates again — it owns presets.json — so a
   * rejected preset comes back with the reasons instead of throwing.
   */
  savePreset(preset: Preset): Promise<SaveResult>
  deletePreset(id: string): Promise<void>
  /** Read from the OS login item, never from a value the app stored. */
  getLaunchAtLogin(): Promise<boolean>
  /** Returns the state the OS has after the write, which may differ. */
  setLaunchAtLogin(enabled: boolean): Promise<boolean>
  /** Returns its own unsubscribe, so a view can clean up on unmount. */
  onTimerView(listener: (view: TimerView) => void): () => void
}
