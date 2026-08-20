import type { Alert } from '../../shared/alert'
import type { Transition } from '../timer/machine'

/**
 * The one alert a batch of transitions deserves, or null for silence.
 *
 * Timing is wall-clock (see AGENTS.md), so a single tick after the lid opens can
 * drain an hour of phases. The user needs to know where the timer *is*, so only
 * the last transition speaks — a burst of nudges for phases that elapsed in the
 * dark is noise, and the first one would be the most stale.
 */
export const alertFor = (transitions: readonly Transition[]): Alert | null => {
  const last = transitions.at(-1)
  if (!last || !last.completed.notify) return null
  return {
    completedLabel: last.completed.label,
    nextLabel: last.next?.label ?? null,
  }
}
