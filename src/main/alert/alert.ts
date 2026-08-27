import type { Alert } from '../../shared/alert'
import type { Transition } from '../timer/machine'

/**
 * The alerts a batch of transitions deserves — at most one per run, in the order
 * the runs reached their boundaries.
 *
 * Timing is wall-clock (see AGENTS.md), so a single tick after the lid opens can
 * drain an hour of phases. The user needs to know where each run *is*, so only
 * the last transition of each run speaks — a burst of nudges for phases that
 * elapsed in the dark is noise, and the first one would be the most stale. Two
 * runs crossing a boundary in the same tick are two things to be told, though,
 * which is why this is a list and not one alert: neither of them is news about
 * the other.
 *
 * A boundary the user asked for says nothing at all: they clicked Skip, so they
 * already know, and an overlay to dismiss straight afterwards is an obstacle
 * rather than a nudge.
 */
export const alertsFor = (
  transitions: readonly Transition[],
): readonly Alert[] => {
  // Insertion-ordered and keyed by run, so a later transition of the same run
  // replaces the earlier one without moving it behind another run's.
  const latest = new Map<string, Transition>()
  for (const transition of transitions) {
    if (!transition.completed.notify || transition.cause === 'skipped') continue
    latest.set(transition.presetId, transition)
  }

  return [...latest.values()].map((transition) => ({
    runId: transition.presetId,
    completedLabel: transition.completed.label,
    nextLabel: transition.next?.label ?? null,
  }))
}
