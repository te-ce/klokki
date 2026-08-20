import type { HistoryEvent } from '../../shared/history'
import type { Snooze } from '../timer/machine'
import type { TimerUpdate } from '../timer/service'

/** The slice of the timer service history needs: transitions, as they happen. */
type HistorySource = {
  readonly subscribe: (listener: (update: TimerUpdate) => void) => () => void
}

/**
 * Writes one line per stretch of phase that ended.
 *
 * The append is injected, so what to record stays testable without a filesystem
 * — the same shape as `wireAlerts` and its presenter.
 *
 * A stretch is recorded when it actually ends, never when it starts, which is
 * what keeps the log honest about a snooze: the deferred stretch begins at the
 * boundary it pushed back, so its duration is the snooze rather than a second
 * full-length phase. Recording at the end is also why nothing is buffered — a
 * kill loses at most the phase in progress, which had not happened yet.
 */
export const recordHistory = (
  source: HistorySource,
  append: (event: HistoryEvent) => void,
): (() => void) => {
  // The snooze arrives on the update the user clicked, and the stretch it granted
  // ends minutes later; this remembers which stretch that is until it does.
  let pending: Snooze | null = null

  return source.subscribe(({ transitions, snoozed }) => {
    if (snoozed) pending = snoozed

    for (const transition of transitions) {
      const durationMs = transition.at - transition.startedAt
      // A zero-length stretch is not something that happened to the user.
      if (durationMs <= 0) continue

      const wasSnoozed =
        pending !== null &&
        pending.at === transition.startedAt &&
        pending.phase.label === transition.completed.label
      if (wasSnoozed) pending = null

      append({
        endedAt: transition.at,
        presetId: transition.presetId,
        phaseLabel: transition.completed.label,
        durationMs,
        // A skipped stretch is recorded as skipped even when it was snoozed
        // first: the last thing that happened to it is that the user cut it
        // short, and the minutes it granted are the duration either way.
        outcome:
          transition.cause === 'skipped'
            ? 'skipped'
            : wasSnoozed
              ? 'snoozed'
              : 'completed',
      })
    }
  })
}
