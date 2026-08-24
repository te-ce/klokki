import type { SportSettings, SportsView } from '../../shared/sport'
import type { SportRunState } from './engine'

/**
 * Joins the saved settings with the engine's live schedule — the Sports
 * counterpart to `toReminderViews`, for a single schedule instead of a list.
 */
export const toSportsView = (
  settings: SportSettings,
  state: SportRunState,
): SportsView => ({
  ...settings,
  nextFireAt: state.nextFireAt,
  awaiting: state.scheduled && state.nextFireAt === null,
})
