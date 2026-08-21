import type { ReminderDefinition } from '../../shared/reminder'
import { createPoller } from '../polling'
import { systemClock, type Clock } from '../timer/clock'
import {
  snooze as snoozeEngine,
  tick,
  withConfirmed,
  withRemoved,
  withScheduled,
  type ReminderDue,
  type RemindersState,
} from './engine'

const POLL_INTERVAL_MS = 1_000

export type ReminderService = {
  /**
   * The reminder store's current list, called whenever it changes. Diffs
   * against the running schedule: a newly enabled reminder is scheduled
   * fresh, and one disabled or removed is dropped.
   */
  readonly setDefinitions: (definitions: readonly ReminderDefinition[]) => void
  /**
   * Restores a schedule loaded from disk instead of rescheduling fresh — a
   * reminder due in 90 minutes is still due in 90 minutes after a relaunch.
   * Drains whatever elapsed while the app was closed, the same as the timer's
   * `resume`.
   */
  readonly resume: (
    loaded: RemindersState,
    definitions: readonly ReminderDefinition[],
  ) => void
  /**
   * Defers the step that just fired for this reminder. Answers whether
   * anything moved: there may be no running schedule for this id.
   */
  readonly snooze: (id: string, extraMs: number) => boolean
  /**
   * Starts this reminder's next interval, because the step that fired has been
   * answered. Answers whether anything moved: a reminder that is not waiting
   * for an answer has nothing to confirm.
   */
  readonly confirm: (id: string) => boolean
  /**
   * Schedules this reminder one full interval from now, because the user asked
   * for it from the tray — a fresh start, whether or not it was already
   * scheduled. Answers whether it could be: an unknown or unrunnable reminder
   * cannot.
   */
  readonly start: (id: string) => boolean
  readonly getState: () => RemindersState
  readonly subscribe: (
    listener: (due: readonly ReminderDue[]) => void,
  ) => () => void
  /**
   * Fired whenever the live schedule changes, for any reason — a firing, an
   * answer, a start, an edit.
   *
   * Separate from `subscribe` because "a reminder is asking for you" and "the
   * schedule is different now" are different events, and only the first belongs
   * on an overlay. Everything that has to keep up with the schedule rather than
   * react to a firing — what a window is shown, what is written to disk —
   * listens here, because an answered reminder changes when it next speaks
   * without anything coming due.
   */
  readonly onScheduleChange: (listener: () => void) => () => void
  readonly dispose: () => void
}

/**
 * The impure shell around the reminder engine — owns the poll timer and the
 * live schedule, the same shape as `createTimerService` around the phase
 * machine. All the logic it drives is pure (engine.ts), which is where the
 * tests live.
 */
export const createReminderService = (
  clock: Clock = systemClock,
): ReminderService => {
  let state: RemindersState = []
  let definitions: readonly ReminderDefinition[] = []
  const listeners = new Set<(due: readonly ReminderDue[]) => void>()
  const changeListeners = new Set<() => void>()

  const emit = (due: readonly ReminderDue[]): void => {
    if (due.length === 0) return
    for (const listener of listeners) listener(due)
  }

  const announceChange = (): void => {
    for (const listener of changeListeners) listener()
  }

  /**
   * Nothing to poll for once every run is either gone or waiting for an answer:
   * a waiting run has no `nextFireAt` to reach, and it can only start counting
   * again through a call that comes back through here.
   */
  const syncPolling = (): void => {
    if (state.some((run) => run.nextFireAt !== null)) poller.start()
    else poller.stop()
  }

  function advance(): void {
    const before = state
    const result = tick(state, definitions, clock.now())
    state = result.state
    syncPolling()
    if (state !== before) announceChange()
    emit(result.due)
  }

  const poller = createPoller(POLL_INTERVAL_MS, advance)

  return {
    setDefinitions: (next) => {
      const previous = definitions
      definitions = next

      const previouslyScheduled = new Set(state.map((run) => run.definitionId))
      const stillEnabled = new Set(
        next.filter((d) => d.enabled).map((d) => d.id),
      )

      for (const definition of next) {
        const was = previous.find((d) => d.id === definition.id)
        if (
          definition.enabled &&
          definition.steps.length > 0 &&
          (!was?.enabled || !previouslyScheduled.has(definition.id))
        )
          state = withScheduled(state, definition, clock.now())
      }

      for (const run of state) {
        if (!stillEnabled.has(run.definitionId))
          state = withRemoved(state, run.definitionId)
      }

      syncPolling()
      announceChange()
    },
    resume: (loaded, defs) => {
      definitions = defs
      const result = tick(loaded, defs, clock.now())
      state = result.state
      syncPolling()
      announceChange()
      emit(result.due)
    },
    confirm: (id) => {
      const definition = definitions.find((d) => d.id === id)
      if (!definition) return false
      const before = state
      state = withConfirmed(state, definition, clock.now())
      syncPolling()
      if (state !== before) announceChange()
      return state !== before
    },
    start: (id) => {
      const definition = definitions.find((d) => d.id === id)
      if (!definition || definition.steps.length === 0) return false
      state = withScheduled(state, definition, clock.now())
      syncPolling()
      announceChange()
      return true
    },
    snooze: (id, extraMs) => {
      const definition = definitions.find((d) => d.id === id)
      if (!definition) return false
      const before = state
      state = snoozeEngine(state, definition, clock.now(), extraMs)
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
