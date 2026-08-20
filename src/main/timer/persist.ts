import type { TimerState } from './machine'
import type { TimerUpdate } from './service'
import type { SnapshotStore } from './snapshot'

/** The slice of the timer service persistence needs: state, as it changes. */
type PersistSource = {
  readonly subscribe: (listener: (update: TimerUpdate) => void) => () => void
  readonly getState: () => TimerState
}

/**
 * Saves the running state after every change, so a restart can resume it — the
 * same shape as `recordHistory` and `wireAlerts`. Idle clears the file rather
 * than writing it, so a finished or stopped run cannot resurrect on next boot.
 */
export const persistSnapshot = (
  source: PersistSource,
  snapshot: SnapshotStore,
): (() => void) =>
  source.subscribe(() => {
    const state = source.getState()
    if (state.status === 'idle') snapshot.clear()
    else snapshot.save(state)
  })
