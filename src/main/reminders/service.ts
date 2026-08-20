import type { ReminderDefinition } from '../../shared/reminder'
import { systemClock, type Clock } from '../timer/clock'
import {
  snooze as snoozeEngine,
  tick,
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
  readonly getState: () => RemindersState
  readonly subscribe: (
    listener: (due: readonly ReminderDue[]) => void,
  ) => () => void
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
  let poll: ReturnType<typeof setInterval> | null = null
  const listeners = new Set<(due: readonly ReminderDue[]) => void>()

  const emit = (due: readonly ReminderDue[]): void => {
    if (due.length === 0) return
    for (const listener of listeners) listener(due)
  }

  const stopPolling = (): void => {
    if (poll === null) return
    clearInterval(poll)
    poll = null
  }

  const syncPolling = (): void => {
    if (state.length === 0) stopPolling()
    else if (poll === null) poll = setInterval(advance, POLL_INTERVAL_MS)
  }

  function advance(): void {
    const result = tick(state, definitions, clock.now())
    state = result.state
    syncPolling()
    emit(result.due)
  }

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
    },
    resume: (loaded, defs) => {
      definitions = defs
      const result = tick(loaded, defs, clock.now())
      state = result.state
      syncPolling()
      emit(result.due)
    },
    snooze: (id, extraMs) => {
      const definition = definitions.find((d) => d.id === id)
      if (!definition) return false
      const before = state
      state = snoozeEngine(state, definition, clock.now(), extraMs)
      syncPolling()
      return state !== before
    },
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose: () => {
      stopPolling()
      listeners.clear()
    },
  }
}
