import type { ReminderAlert } from '../../shared/reminder-alert'
import { EMPTY_QUEUE, advance, enqueue, type ReminderQueueState } from './queue'
import type { ReminderDue } from './engine'

/** The slice of the reminder service the overlay needs: due events, and a way to defer one. */
type ReminderAlertSource = {
  readonly subscribe: (
    listener: (due: readonly ReminderDue[]) => void,
  ) => () => void
  readonly snooze: (id: string, extraMs: number) => boolean
}

export type ReminderAlertController = {
  /** Defers the reminder currently showing. False when nothing is showing. */
  readonly snooze: (extraMs: number) => boolean
  /** Answers the reminder currently showing as done. No-op when nothing is showing. */
  readonly complete: (quantity: number | null) => void
  readonly dispose: () => void
}

const toAlert = (due: ReminderDue): ReminderAlert => ({
  label: due.step.label,
  unit: due.step.unit ?? null,
})

/**
 * Turns the reminder service's due events into overlays, one at a time — the
 * reminder counterpart to alert/wire.ts. Unlike a phase transition, every due
 * reminder gets shown rather than only the last of a batch: each one is
 * something the user still has to answer, so it is queued instead of dropped
 * (see issues/open/09).
 */
export const wireReminderAlerts = (
  source: ReminderAlertSource,
  present: (alert: ReminderAlert) => void,
  close: () => void,
): ReminderAlertController => {
  let queue: ReminderQueueState = EMPTY_QUEUE

  const showNext = (due: ReminderDue): void => present(toAlert(due))

  const unsubscribe = source.subscribe((due) => {
    const result = enqueue(queue, due)
    queue = result.state
    if (result.toShow) showNext(result.toShow)
  })

  const advanceQueue = (): void => {
    const result = advance(queue)
    queue = result.state
    if (result.toShow) showNext(result.toShow)
  }

  return {
    snooze: (extraMs) => {
      const current = queue.current
      if (!current) return false
      const snoozed = source.snooze(current.definitionId, extraMs)
      close()
      advanceQueue()
      return snoozed
    },
    complete: (_quantity) => {
      if (!queue.current) return
      close()
      advanceQueue()
    },
    dispose: unsubscribe,
  }
}
