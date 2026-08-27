import type { ReminderDue } from './engine'

/**
 * At most one reminder overlay is ever open (see issues/open/09): a batch of
 * due reminders is shown one at a time, in the order they fired, rather than
 * stacking overlapping overlay windows.
 */
export type ReminderQueueState = {
  readonly current: ReminderDue | null
  readonly pending: readonly ReminderDue[]
}

export const EMPTY_QUEUE: ReminderQueueState = { current: null, pending: [] }

export type ReminderQueueResult = {
  readonly state: ReminderQueueState
  /** The reminder to present now, or null when nothing new should be shown. */
  readonly toShow: ReminderDue | null
}

/** Adds a batch of newly-due reminders, showing the first only if nothing is showing. */
export const enqueue = (
  state: ReminderQueueState,
  due: readonly ReminderDue[],
): ReminderQueueResult => {
  if (due.length === 0) return { state, toShow: null }

  if (state.current !== null)
    return {
      state: { ...state, pending: [...state.pending, ...due] },
      toShow: null,
    }

  const [first, ...rest] = due
  if (!first) return { state, toShow: null }
  return {
    state: { current: first, pending: [...state.pending, ...rest] },
    toShow: first,
  }
}

/** The current reminder has been answered — show whatever is queued behind it. */
export const advance = (state: ReminderQueueState): ReminderQueueResult => {
  const [next, ...rest] = state.pending
  if (!next) return { state: EMPTY_QUEUE, toShow: null }
  return { state: { current: next, pending: rest }, toShow: next }
}

/**
 * Drops queued reminders that are no longer running, leaving what is showing
 * alone — that one is the controller's to void, because voiding it means
 * closing a window and showing whatever was behind it.
 *
 * A reminder disabled or deleted while another's overlay is up would otherwise
 * come round in its turn and announce a firing nothing can answer.
 */
export const retainPending = (
  state: ReminderQueueState,
  isRunning: (definitionId: string) => boolean,
): ReminderQueueState => ({
  ...state,
  pending: state.pending.filter((due) => isRunning(due.definitionId)),
})
