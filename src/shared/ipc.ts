/**
 * The single contract between main and renderer.
 *
 * The renderer is sandboxed and has no Node access (see AGENTS.md): everything it
 * knows about the app arrives through this interface, implemented in src/preload
 * and served by src/main.
 */

import type { HistoryStats } from './history'
import type { Preset, SaveResult } from './preset'
import type { ReminderDefinition, ReminderView } from './reminder'
import type { ReminderHistoryStats } from './reminder-history'
import type { TimerView } from './timer'

/** Renderer → main. Every one of these has a handler in src/main/ipc. */
export const IPC = {
  getAppInfo: 'klokki:get-app-info',
  listPresets: 'klokki:list-presets',
  getTimerView: 'klokki:get-timer-view',
  getStats: 'klokki:get-stats',
  getReminderStats: 'klokki:get-reminder-stats',
  startPreset: 'klokki:start-preset',
  savePreset: 'klokki:save-preset',
  deletePreset: 'klokki:delete-preset',
  getLaunchAtLogin: 'klokki:get-launch-at-login',
  setLaunchAtLogin: 'klokki:set-launch-at-login',
  stopTimer: 'klokki:stop-timer',
  skipPhase: 'klokki:skip-phase',
  confirmNext: 'klokki:confirm-next',
  setRemaining: 'klokki:set-remaining',
  addTime: 'klokki:add-time',
  dismissAlert: 'klokki:dismiss-alert',
  snoozeAlert: 'klokki:snooze-alert',
  listReminders: 'klokki:list-reminders',
  saveReminder: 'klokki:save-reminder',
  deleteReminder: 'klokki:delete-reminder',
  setReminderEnabled: 'klokki:set-reminder-enabled',
  snoozeReminder: 'klokki:snooze-reminder',
  completeReminder: 'klokki:complete-reminder',
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
  /**
   * Today plus the last seven days of answered reminder steps, derived from
   * the tail of reminders-history.jsonl on every call — the reminder
   * counterpart to `getStats`.
   */
  getReminderStats(): Promise<ReminderHistoryStats>
  startPreset(id: string): Promise<void>
  stopTimer(): Promise<void>
  /**
   * Ends the running phase now and starts the next one — for standing up before
   * the sitting phase is out. Raises no transition alert: the user chose this
   * boundary. Resolves to whether anything moved; nothing does while idle.
   */
  skipPhase(): Promise<boolean>
  /**
   * Starts the phase a boundary is holding, because the user said they are
   * ready — the same thing dismissing the transition overlay does, for a window
   * that is looking at a waiting run instead. The phase gets its full length
   * from now. Resolves to whether anything moved; nothing does unless the run is
   * waiting.
   */
  confirmNext(): Promise<boolean>
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
  /**
   * A second, independent list from presets — see issues/open/08. Each entry
   * carries its own `nextFireAt`, joined from the reminder engine's live
   * schedule (see src/main/reminders/view.ts).
   */
  listReminders(): Promise<readonly ReminderView[]>
  /** Upsert by id. The main process validates again — it owns reminders.json. */
  saveReminder(definition: ReminderDefinition): Promise<SaveResult>
  deleteReminder(id: string): Promise<void>
  setReminderEnabled(id: string, enabled: boolean): Promise<void>
  /**
   * Defers the reminder the overlay is currently showing, by `extraMs` — one of
   * the fixed +5/+10/+15 options, matching `snoozeAlert`'s convention of the
   * main process owning the amount. Resolves to whether it was actually
   * deferred; declined the same way a phase snooze is when its new time has
   * already passed.
   */
  snoozeReminder(extraMs: number): Promise<boolean>
  /**
   * Answers the reminder the overlay is currently showing as done, with a
   * quantity for a step that has a `unit` or null for one that doesn't. Closes
   * the overlay and lets the engine's normal advance stand.
   */
  completeReminder(quantity: number | null): Promise<void>
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
    listener: (reminders: readonly ReminderView[]) => void,
  ): () => void
}
