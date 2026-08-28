import type { SportSettings, SportsView } from '../../shared/sport'
import { formatRemaining } from '../timer/format'
import type { SportRunState } from './engine'

/**
 * Joins the saved settings with the engine's live schedule, for the one
 * Sports schedule there is.
 *
 * `now` turns `nextFireAt` into a countdown the same way the timer's
 * `toView` does — nothing here is cached, so a call an hour from now reads
 * the schedule fresh rather than replaying the moment it was made.
 */
export const toSportsView = (
  settings: SportSettings,
  state: SportRunState,
  now: number,
): SportsView => {
  const remainingMs =
    state.scheduled && state.nextFireAt !== null
      ? Math.max(0, state.nextFireAt - now)
      : null

  return {
    ...settings,
    nextFireAt: state.nextFireAt,
    awaiting: state.scheduled && state.nextFireAt === null,
    remainingMs,
    countdown: remainingMs === null ? null : formatRemaining(remainingMs),
  }
}
