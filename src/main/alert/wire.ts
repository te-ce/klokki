import type { TimerUpdate } from '../timer/service'
import type { Alert } from '../../shared/alert'
import { alertFor } from './alert'

/** The slice of the timer service an alert needs: transitions, as they happen. */
type AlertSource = {
  readonly subscribe: (listener: (update: TimerUpdate) => void) => () => void
}

/**
 * Turns the timer's transitions into at most one alert per update.
 *
 * The presenter is injected so the decision of *whether* to alert stays testable
 * without a display: everything platform-shaped lives behind this callback.
 */
export const wireAlerts = (
  source: AlertSource,
  present: (alert: Alert) => void,
): (() => void) =>
  source.subscribe(({ transitions }) => {
    const alert = alertFor(transitions)
    if (alert) present(alert)
  })
