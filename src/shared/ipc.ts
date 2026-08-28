/**
 * The single contract between main and renderer.
 *
 * The renderer is sandboxed and has no Node access (see AGENTS.md): everything it
 * knows about the app arrives through this interface, implemented in src/preload
 * and served by src/main.
 */

import type { HistoryStats } from './history'
import type { Preset, SaveResult } from './preset'
import type { SportSettings, SportsView } from './sport'
import type { SportsHistoryStats } from './sports-history'
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
  stopFromAlert: 'klokki:stop-from-alert',
  skipPhase: 'klokki:skip-phase',
  confirmNext: 'klokki:confirm-next',
  setRemaining: 'klokki:set-remaining',
  addTime: 'klokki:add-time',
  dismissAlert: 'klokki:dismiss-alert',
  snoozeAlert: 'klokki:snooze-alert',
  getSportsSettings: 'klokki:get-sports-settings',
  saveSportsSettings: 'klokki:save-sports-settings',
  startSports: 'klokki:start-sports',
  stopSports: 'klokki:stop-sports',
  snoozeSports: 'klokki:snooze-sports',
  stopSportsFromAlert: 'klokki:stop-sports-from-alert',
  confirmSports: 'klokki:confirm-sports',
  logSports: 'klokki:log-sports',
  getSportsStats: 'klokki:get-sports-stats',
  setRemainingSports: 'klokki:set-remaining-sports',
  addTimeSports: 'klokki:add-time-sports',
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
  /** Every run in progress, once a second while any of them counts. */
  timerView: 'klokki:timer-view',
  /** The saved preset list, whenever it changes — from any window, or the tray. */
  presets: 'klokki:presets',
  /** A stretch of phase was written to the log. Carries nothing: re-read. */
  historyChanged: 'klokki:history-changed',
  /** The Sports settings joined with its live schedule, whenever either changes. */
  sports: 'klokki:sports',
} as const

export type AppInfo = {
  version: string
  electron: string
}

export interface KlokkiApi {
  getAppInfo(): Promise<AppInfo>
  listPresets(): Promise<readonly Preset[]>
  /**
   * Every run in progress, for a window that has just opened: waiting for the
   * next push would leave it blank for up to a second.
   */
  getTimerView(): Promise<TimerView>
  /**
   * Today plus the last seven days, derived from the tail of history.jsonl on
   * every call — the renderer keeps no copy to go stale.
   */
  getStats(): Promise<HistoryStats>
  /**
   * Starts a preset, or restarts it if it is already running — the run is keyed
   * on the preset id, so a preset never has two runs at once (see AGENTS.md).
   * Every other preset in progress keeps going.
   */
  startPreset(id: string): Promise<void>
  /**
   * Ends one run. Several presets can be running, so this names the one to stop
   * rather than "the" timer — `runId` is the id of the preset it is running,
   * which is what `TimerView.runs` carries.
   */
  stopTimer(runId: string): Promise<void>
  /**
   * Ends a run's current phase now and starts its next one — for standing up
   * before the sitting phase is out. Raises no transition alert: the user chose
   * this boundary. Resolves to whether anything moved; nothing does for a run
   * that is not going.
   */
  skipPhase(runId: string): Promise<boolean>
  /**
   * Starts the phase a run's boundary is holding, because the user said they are
   * ready — the same thing dismissing that run's transition overlay does, for a
   * window that is looking at a waiting run instead. The phase gets its full
   * length from now. Resolves to whether anything moved; nothing does unless the
   * run is waiting.
   */
  confirmNext(runId: string): Promise<boolean>
  /**
   * Corrects a run's current phase's remaining time to `targetMs` — for a timer
   * started late, so the web UI can pull it back in sync with the wall clock.
   * Resolves to whether anything moved.
   */
  setRemaining(runId: string, targetMs: number): Promise<boolean>
  /**
   * Adds `extraMs` to a run's current phase's remaining time — for running long,
   * so a keystroke or tray click adds minutes without naming a target time.
   * Resolves to whether anything moved.
   */
  addTime(runId: string, extraMs: number): Promise<boolean>
  /**
   * Answers the boundary the transition overlay is announcing, and closes it.
   * The only way out of the overlay — it never times out.
   *
   * The run comes from the alert the overlay was opened with (`Alert.runId`),
   * because two runs can each be holding at a boundary and only one of them is
   * on screen. Answering also raises whichever boundary was queued behind this
   * one.
   */
  dismissAlert(runId: string): Promise<void>
  /**
   * Stops the run the transition overlay is announcing, and closes the overlay
   * — the same `stopTimer` the tray and the Timer pane call, plus the close the
   * overlay would otherwise wait forever for. An alert is where the user is
   * when they decide they are done for the day, so the decision is offered
   * there rather than only in a window they would have to open first.
   */
  stopFromAlert(runId: string): Promise<void>
  /**
   * Defers the boundary the overlay is showing and closes it, by `extraMs` —
   * one of the fixed +5/+10/+15/+30 options, the renderer picking among fixed
   * increments.
   *
   * Resolves to whether the boundary was actually deferred. A snooze whose new
   * end has already gone by is declined, and the overlay closes either way — but
   * the two are different events, so they do not answer the same.
   */
  snoozeAlert(runId: string, extraMs: number): Promise<boolean>
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
  /** Read once for a window that has just opened, then kept fresh by `onSports`. */
  getSportsSettings(): Promise<SportsView>
  /** Upsert whole: there is only ever one Sports schedule to save. */
  saveSportsSettings(settings: SportSettings): Promise<SaveResult>
  /** Enables Sports and schedules it a full interval from now — Start/Restart. */
  startSports(): Promise<void>
  stopSports(): Promise<void>
  /**
   * Defers the current Sports firing by `extraMs` — one of the fixed
   * +5/+10/+15/+30 options, matching `snoozeAlert`'s convention. Resolves to
   * whether it was actually deferred.
   */
  snoozeSports(extraMs: number): Promise<boolean>
  /**
   * Answers the current Sports firing as done, with a quantity per activity
   * id. Closes the overlay and starts the next interval.
   */
  confirmSports(quantities: Readonly<Record<string, number>>): Promise<void>
  /**
   * Stops Sports from the overlay it raised, and closes the overlay — the same
   * disable `stopSports` does from the tray and the Sports tab.
   */
  stopSportsFromAlert(): Promise<void>
  /**
   * Logs Sports activity from the Sports tab, independent of the running
   * schedule — it never restarts the interval, unlike `confirmSports`.
   */
  logSports(quantities: Readonly<Record<string, number>>): Promise<void>
  /**
   * Today plus the last seven days of logged Sports activity, derived from
   * the tail of sports-history.jsonl on every call.
   */
  getSportsStats(): Promise<SportsHistoryStats>
  /**
   * Corrects the running Sports countdown to `targetMs` — the Sports
   * counterpart to `setRemaining`. Resolves to whether anything moved;
   * nothing does while awaiting an answer or unscheduled.
   */
  setRemainingSports(targetMs: number): Promise<boolean>
  /**
   * Adds `extraMs` to the running Sports countdown — the Sports counterpart
   * to `addTime`. Resolves to whether anything moved, the same guard.
   */
  addTimeSports(extraMs: number): Promise<boolean>
  onSports(listener: (view: SportsView) => void): () => void
}
