import type { Alert } from '../../shared/alert'
import type { TimerUpdate } from '../timer/service'
import { alertsFor } from './alert'
import {
  EMPTY_ALERT_QUEUE,
  answerAlert,
  enqueueAlerts,
  type AlertQueueState,
} from './queue'

/** The slice of the timer service an alert needs: transitions, as they happen. */
type AlertSource = {
  readonly subscribe: (listener: (update: TimerUpdate) => void) => () => void
}

export type TimerAlertController = {
  /**
   * A run's boundary has been answered, or the run has stopped — so its alert is
   * void. The overlay on screen closes and its notification is withdrawn only if
   * it was this run's, and whatever boundary was queued behind it is raised.
   *
   * Every way a boundary can be answered comes through here: the overlay's own
   * three controls, the tray's Start/Skip/Stop, and the Timer pane's buttons.
   * Nothing else has to remember to close a window — which is what keeps a
   * boundary confirmed from the tray from leaving its overlay standing.
   */
  readonly answered: (runId: string) => void
  /** What the overlay is showing, for a test that wants to see the queue work. */
  readonly showing: () => Alert | null
  readonly dispose: () => void
}

/**
 * Turns the timer's transitions into overlays, one at a time.
 *
 * The presenter and the void are injected so the decision of *whether* to alert,
 * and *whose* alert is on screen, stays testable without a display: everything
 * platform-shaped lives behind those two callbacks.
 *
 * Unlike a single run, a batch can raise more than one alert — two presets can
 * cross a boundary in the same poll — so alerts are queued rather than dropped,
 * the same shape reminders already use (reminders/queue.ts). The run behind a
 * queued boundary is still holding: no time passes, the tray names it, and the
 * Timer pane offers it, so a superseded boundary is never lost, only later.
 */
export const wireAlerts = (
  source: AlertSource,
  present: (alert: Alert) => void,
  /** Voids the alert showing — both halves of it (see alert/void.ts). */
  close: () => void,
): TimerAlertController => {
  let queue: AlertQueueState = EMPTY_ALERT_QUEUE

  const unsubscribe = source.subscribe(({ transitions }) => {
    const result = enqueueAlerts(queue, alertsFor(transitions))
    queue = result.state
    // Presenting supersedes whatever window is up, which is exactly what an
    // alert for a run whose own earlier alert is showing should do.
    if (result.toShow) present(result.toShow)
  })

  return {
    answered: (runId) => {
      const result = answerAlert(queue, runId)
      queue = result.state
      if (result.voided) close()
      if (result.toShow) present(result.toShow)
    },
    showing: () => queue.current,
    dispose: unsubscribe,
  }
}
