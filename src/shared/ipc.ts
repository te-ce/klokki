/**
 * The single contract between main and renderer.
 *
 * The renderer is sandboxed and has no Node access (see AGENTS.md): everything it
 * knows about the app arrives through this interface, implemented in src/preload
 * and served by src/main.
 */

import type { Preset } from './preset'
import type { TimerView } from './timer'

export const IPC = {
  getAppInfo: 'klokki:get-app-info',
  listPresets: 'klokki:list-presets',
  getTimerView: 'klokki:get-timer-view',
  startPreset: 'klokki:start-preset',
  stopTimer: 'klokki:stop-timer',
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
  /** Returns its own unsubscribe, so a view can clean up on unmount. */
  onTimerView(listener: (view: TimerView) => void): () => void
}
