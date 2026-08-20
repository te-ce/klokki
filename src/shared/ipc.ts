/**
 * The single contract between main and renderer.
 *
 * The renderer is sandboxed and has no Node access (see AGENTS.md): everything it
 * knows about the app arrives through this interface, implemented in src/preload
 * and served by src/main.
 */

import type { HistoryStats } from './history'
import type { Preset, SaveResult } from './preset'
import type { ReminderDefinition } from './reminder'
import type { TimerView } from './timer'

/** Renderer → main. Every one of these has a handler in src/main/ipc. */
export const IPC = {
  getAppInfo: 'klokki:get-app-info',
  listPresets: 'klokki:list-presets',
  getTimerView: 'klokki:get-timer-view',
  getStats: 'klokki:get-stats',
  startPreset: 'klokki:start-preset',
  savePreset: 'klokki:save-preset',
  deletePreset: 'klokki:delete-preset',
  getLaunchAtLogin: 'klokki:get-launch-at-login',
  setLaunchAtLogin: 'klokki:set-launch-at-login',
  stopTimer: 'klokki:stop-timer',
  skipPhase: 'klokki:skip-phase',
  setRemaining: 'klokki:set-remaining',
  addTime: 'klokki:add-time',
  dismissAlert: 'klokki:dismiss-alert',
  snoozeAlert: 'klokki:snooze-alert',
  listReminders: 'klokki:list-reminders',
  saveReminder: 'klokki:save-reminder',
  deleteReminder: 'klokki:delete-reminder',
  setReminderEnabled: 'klokki:set-reminder-enabled',
} as const

/**
 * Main → renderer. Declared apart from the requests because they are answered by
 * nobody: main pushes them, and `registerIpc` asserts it has a handler for every
 * channel in `IPC` and none of these.
 *
 * Everything a window has to keep fresh while it is open is here. A view that
 * polls, or that infers one of these from another, is holding state that belongs
 * to the main process.
 */
export const PUSH = {
  /** A fresh view, once a second while the timer runs. */
  timerView: 'klokki:timer-view',
  /** The saved preset list, whenever it changes — from any window, or the tray. */
  presets: 'klokki:presets',
  /** A stretch of phase was written to the log. Carries nothing: re-read. */
  historyChanged: 'klokki:history-changed',
  /** The saved reminder list, whenever it changes — mirrors `presets`. */
  reminders: 'klokki:reminders',
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
  /**
   * Today plus the last seven days, derived from the tail of history.jsonl on
   * every call — the renderer keeps no copy to go stale.
   */
  getStats(): Promise<HistoryStats>
  startPreset(id: string): Promise<void>
  stopTimer(): Promise<void>
  /**
   * Ends the running phase now and starts the next one — for standing up before
   * the sitting phase is out. Raises no transition alert: the user chose this
   * boundary. Resolves to whether anything moved; nothing does while idle.
   */
  skipPhase(): Promise<boolean>
  /**
   * Corrects the running phase's remaining time to `targetMs` — for a timer
   * started late, so the web UI can pull it back in sync with the wall clock.
   * Resolves to whether anything moved; nothing does while idle.
   */
  setRemaining(targetMs: number): Promise<boolean>
  /**
   * Adds `extraMs` to the running phase's remaining time — for running long, so
   * a keystroke or tray click adds minutes without naming a target time.
   * Resolves to whether anything moved; nothing does while idle.
   */
  addTime(extraMs: number): Promise<boolean>
  /** Closes the transition overlay. The only way out of it — it never times out. */
  dismissAlert(): Promise<void>
  /**
   * Defers the boundary the overlay is showing and closes it. The length of the
   * snooze is the main process's to decide (`SNOOZE_MS`): a renderer must not be
   * able to name an amount of time the timer then honours.
   *
   * Resolves to whether the boundary was actually deferred. A snooze whose new
   * end has already gone by is declined, and the overlay closes either way — but
   * the two are different events, so they do not answer the same.
   */
  snoozeAlert(): Promise<boolean>
  /**
   * Upsert by id. The main process validates again — it owns presets.json — so a
   * rejected preset comes back with the reasons instead of throwing.
   */
  savePreset(preset: Preset): Promise<SaveResult>
  deletePreset(id: string): Promise<void>
  /** A second, independent list from presets — see issues/open/08. */
  listReminders(): Promise<readonly ReminderDefinition[]>
  /** Upsert by id. The main process validates again — it owns reminders.json. */
  saveReminder(definition: ReminderDefinition): Promise<SaveResult>
  deleteReminder(id: string): Promise<void>
  setReminderEnabled(id: string, enabled: boolean): Promise<void>
  /** Read from the OS login item, never from a value the app stored. */
  getLaunchAtLogin(): Promise<boolean>
  /** Returns the state the OS has after the write, which may differ. */
  setLaunchAtLogin(enabled: boolean): Promise<boolean>
  /** Returns its own unsubscribe, so a view can clean up on unmount. */
  onTimerView(listener: (view: TimerView) => void): () => void
  /**
   * The preset list has one owner, in the main process. A window that keeps its
   * own copy without this is showing whatever was true when it opened.
   */
  onPresets(listener: (presets: readonly Preset[]) => void): () => void
  /**
   * Fired when a line lands in the log. "The phase label changed" is not the same
   * predicate — a snooze, and two phases sharing a label, both write without it.
   */
  onHistoryChanged(listener: () => void): () => void
  onReminders(
    listener: (reminders: readonly ReminderDefinition[]) => void,
  ): () => void
}
