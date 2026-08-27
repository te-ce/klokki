import type { ReminderAlert } from '../../shared/reminder-alert'
import type { ReminderHistoryEvent } from '../../shared/reminder-history'
import { systemClock, type Clock } from '../timer/clock'
import { EMPTY_QUEUE, advance, enqueue, type ReminderQueueState } from './queue'
import type { ReminderDue } from './engine'

/**
 * The slice of the app the overlay needs: due events, a way to defer one, a way
 * to answer one, and a way to stop the reminder behind one for good.
 *
 * `stop` is the tray's stop path (`stopReminderById`) rather than the service's,
 * because stopping a reminder is a disable the store owns — the schedule going
 * away is what the store's subscriber then does about it.
 */
type ReminderAlertSource = {
  readonly subscribe: (
    listener: (due: readonly ReminderDue[]) => void,
  ) => () => void
  readonly snooze: (id: string, extraMs: number) => boolean
  readonly confirm: (id: string) => boolean
  readonly stop: (id: string) => void
}

export type ReminderAlertController = {
  /** Defers the reminder currently showing. False when nothing is showing. */
  readonly snooze: (extraMs: number) => boolean
  /** Answers the reminder currently showing as done. No-op when nothing is showing. */
  readonly complete: (quantity: number | null) => void
  /**
   * Stops the reminder currently showing, and closes its overlay. No-op when
   * nothing is showing.
   *
   * Which reminder that is is known here and nowhere else, which is why the
   * overlay and the notification both stop "the one showing" rather than an id
   * they carry: a stale id would stop a reminder the user is not looking at.
   */
  readonly stop: () => void
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
 *
 * Answering is also what starts the next interval — Done confirms it, Snooze
 * defers the same step — because a reminder holds after it fires rather than
 * counting down again unattended.
 */
export const wireReminderAlerts = (
  source: ReminderAlertSource,
  present: (alert: ReminderAlert) => void,
  close: () => void,
  /** Appends one line for every Done and every Snooze that actually took. */
  record: (event: ReminderHistoryEvent) => void = () => {},
  clock: Clock = systemClock,
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
      // A declined snooze — its new time already past — deferred nothing, so
      // there is no stretch of "later" to log, the same reason a declined
      // phase snooze writes nothing to history.jsonl.
      if (snoozed)
        record({
          loggedAt: clock.now(),
          reminderId: current.definitionId,
          stepLabel: current.step.label,
          quantity: null,
          outcome: 'snoozed',
        })
      close()
      advanceQueue()
      return snoozed
    },
    stop: () => {
      const current = queue.current
      if (!current) return
      // Disabling is the whole stop: the store's subscriber drops the run, so
      // the firing this overlay was showing is not left waiting for an answer
      // that can no longer be given. Nothing is logged — a stop is neither a
      // "done" nor a "later", and the minutes it did not spend are not history.
      source.stop(current.definitionId)
      close()
      // A reminder stopped is still not the others' answer: anything queued
      // behind it is something the user has yet to see.
      advanceQueue()
    },
    complete: (quantity) => {
      const current = queue.current
      if (!current) return
      // The interval that follows starts here, not at the boundary: the reminder
      // waited for this answer, so the user gets a whole interval of it.
      source.confirm(current.definitionId)
      record({
        loggedAt: clock.now(),
        reminderId: current.definitionId,
        stepLabel: current.step.label,
        quantity,
        outcome: 'done',
      })
      close()
      advanceQueue()
    },
    dispose: unsubscribe,
  }
}
