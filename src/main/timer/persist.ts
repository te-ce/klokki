import type { TimerState } from './machine'
import type { TimerUpdate } from './service'
import type { SnapshotStore } from './snapshot'

/** The slice of the timer service persistence needs: the runs, as they change. */
type PersistSource = {
  readonly subscribe: (listener: (update: TimerUpdate) => void) => () => void
  readonly getStates: () => readonly TimerState[]
}

/**
 * Saves every run after every change, so a restart can resume them all — the
 * same shape as `recordHistory` and `wireAlerts`. The whole collection is
 * written each time rather than one run's line, because a run that ended has to
 * disappear from the file and there is no per-run delete. Nothing running clears
 * the file rather than writing it, so a finished or stopped run cannot resurrect
 * on next boot.
 */
export const persistSnapshot = (
  source: PersistSource,
  snapshot: SnapshotStore,
): (() => void) =>
  source.subscribe(() => {
    const states = source.getStates()
    if (states.length === 0) snapshot.clear()
    else snapshot.save(states)
  })
