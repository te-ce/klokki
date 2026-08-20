import type { Alert } from '../../shared/alert'
import type { Transition } from '../timer/machine'

/**
 * The one alert a batch of transitions deserves, or null for silence.
 *
 * Timing is wall-clock (see AGENTS.md), so a single tick after the lid opens can
 * drain an hour of phases. The user needs to know where the timer *is*, so only
 * the last transition speaks — a burst of nudges for phases that elapsed in the
 * dark is noise, and the first one would be the most stale.
 *
 * A boundary the user asked for says nothing at all: they clicked Skip, so they
 * already know, and an overlay to dismiss straight afterwards is an obstacle
 * rather than a nudge.
 */
export const alertFor = (transitions: readonly Transition[]): Alert | null => {
  const last = transitions.at(-1)
  if (!last || !last.completed.notify || last.cause === 'skipped') return null
  return {
    completedLabel: last.completed.label,
    nextLabel: last.next?.label ?? null,
  }
}
