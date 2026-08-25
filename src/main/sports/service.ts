import { isRunnableSportSettings, type SportSettings } from '../../shared/sport'
import { createPoller } from '../polling'
import { systemClock, type Clock } from '../timer/clock'
import {
  addTime as addTimeEngine,
  fireNow as fireNowEngine,
  scheduleAt,
  setRemaining as setRemainingEngine,
  snooze as snoozeEngine,
  STOPPED,
  tick,
  withConfirmed,
  withRemoved,
  type SportRunState,
} from './engine'

const POLL_INTERVAL_MS = 1_000

export type SportsService = {
  /**
   * The Sports store's current settings, called whenever they change. A
   * transition to `enabled: false` drops the schedule, and one to `true`
   * schedules fresh — editing the interval or activities while a run is in
   * progress does not disturb the current countdown, matching the "editing
   * never disturbs a run in progress" rule presets and reminders both keep.
   */
  readonly setSettings: (settings: SportSettings) => void
  /**
   * Restores a schedule loaded from disk instead of scheduling fresh — the
   * Sports counterpart to `ReminderService.resume`.
   */
  readonly resume: (loaded: SportRunState, settings: SportSettings) => void
  /** Defers the current firing. Answers whether anything moved. */
  readonly snooze: (extraMs: number) => boolean
  /** Starts the next interval because the firing was answered. */
  readonly confirm: () => boolean
  /**
   * Corrects the running countdown to `targetMs`. Answers whether anything
   * moved; nothing does while awaiting an answer or unscheduled.
   */
  readonly setRemaining: (targetMs: number) => boolean
  /**
   * Adds `extraMs` to the running countdown. Answers whether anything moved,
   * the same guard `setRemaining` uses.
   */
  readonly addTime: (extraMs: number) => boolean
  /**
   * Schedules Sports one full interval from now, whether or not it was
   * already running — Start/Restart from the tray. Answers whether it
   * could be: no activities or a zero interval cannot be scheduled.
   */
  readonly start: () => boolean
  /**
   * Fires Sports right now, regardless of the schedule — the tray's "Log
   * Sports Now". Answers whether it could: no activities or a zero interval
   * cannot fire, the same guard `start` uses. A firing already awaiting an
   * answer is left as it is, not restarted.
   */
  readonly fireNow: () => boolean
  readonly getState: () => SportRunState
  readonly subscribe: (listener: () => void) => () => void
  /** Every change to the schedule, not just a firing — see `ReminderService`. */
  readonly onScheduleChange: (listener: () => void) => () => void
  readonly dispose: () => void
}

/**
 * The impure shell around the Sports engine — owns the poll timer and the
 * live schedule, the single-schedule counterpart to `createReminderService`.
 */
export const createSportsService = (
  clock: Clock = systemClock,
): SportsService => {
  let state: SportRunState = STOPPED
  let settings: SportSettings = {
    intervalMinutes: 0,
    activities: [],
    enabled: false,
  }
  const listeners = new Set<() => void>()
  const changeListeners = new Set<() => void>()

  const emit = (): void => {
    for (const listener of listeners) listener()
  }

  const announceChange = (): void => {
    for (const listener of changeListeners) listener()
  }

  const syncPolling = (): void => {
    if (state.scheduled && state.nextFireAt !== null) poller.start()
    else poller.stop()
  }

  function advance(): void {
    const result = tick(state, settings, clock.now())
    state = result.state
    syncPolling()
    // Unconditional, not just on change: the view's countdown is derived from
    // `now` at read time, so it must be re-announced every poll while
    // counting down, the same reason the timer's service pushes every
    // second regardless of whether `TimerState` itself moved.
    announceChange()
    if (result.fired) emit()
  }

  const poller = createPoller(POLL_INTERVAL_MS, advance)

  return {
    setSettings: (next) => {
      const wasEnabled = settings.enabled
      const wasScheduled = state.scheduled
      settings = next

      // Newly enabled, or enabled but not actually scheduled yet — e.g. right
      // after `resume` loaded nothing to restore: either way this is the
      // moment to give it a fresh schedule, the same two conditions
      // `ReminderService.setDefinitions` checks per definition.
      if (
        next.enabled &&
        isRunnableSportSettings(next) &&
        (!wasEnabled || !wasScheduled)
      )
        state = scheduleAt(next, clock.now())
      else if (!next.enabled) state = withRemoved()

      syncPolling()
      announceChange()
    },
    resume: (loaded, initial) => {
      settings = initial
      const result = tick(loaded, initial, clock.now())
      state = result.state
      syncPolling()
      announceChange()
      if (result.fired) emit()
    },
    confirm: () => {
      const before = state
      state = withConfirmed(state, settings, clock.now())
      syncPolling()
      if (state !== before) announceChange()
      return state !== before
    },
    start: () => {
      if (!isRunnableSportSettings(settings)) return false
      state = scheduleAt(settings, clock.now())
      syncPolling()
      announceChange()
      return true
    },
    fireNow: () => {
      if (!isRunnableSportSettings(settings)) return false
      const before = state
      state = fireNowEngine(state)
      syncPolling()
      if (state !== before) {
        announceChange()
        emit()
      }
      return true
    },
    snooze: (extraMs) => {
      const before = state
      state = snoozeEngine(state, clock.now(), extraMs)
      syncPolling()
      if (state !== before) announceChange()
      return state !== before
    },
    setRemaining: (targetMs) => {
      const before = state
      state = setRemainingEngine(state, clock.now(), targetMs)
      syncPolling()
      if (state !== before) announceChange()
      return state !== before
    },
    addTime: (extraMs) => {
      const before = state
      state = addTimeEngine(state, extraMs)
      syncPolling()
      if (state !== before) announceChange()
      return state !== before
    },
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    onScheduleChange: (listener) => {
      changeListeners.add(listener)
      return () => changeListeners.delete(listener)
    },
    dispose: () => {
      poller.stop()
      listeners.clear()
      changeListeners.clear()
    },
  }
}
