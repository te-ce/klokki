import type { Alert } from '../../shared/alert'
import { notificationFor, type NotificationText } from './notification'

/** The platform half of an alert: a notification, and the overlay window. */
export type AlertSurface = {
  readonly notify: (text: NotificationText) => void
  /**
   * Takes the last notification back — for a stop, which voids the alert it
   * raised (see alert/void.ts). Only the platform can do it, and only through
   * the handle it kept, so it is a capability of the surface rather than
   * something the decision above it could arrange for itself.
   */
  readonly withdraw: () => void
  readonly showOverlay: (alert: Alert) => void
}

/**
 * Both halves of an alert, because either one alone is missable.
 *
 * The notification is what the user sees while working normally; the overlay is
 * what survives Do Not Disturb and a fullscreen app, which is where a "stand up"
 * nudge matters most (see AGENTS.md). The overlay is therefore shown even when the
 * notification fails — the half that can be swallowed must not be able to take the
 * other one down with it.
 */
export const createAlertPresenter =
  (
    surface: AlertSurface,
    /**
     * Stops the run and closes the overlay, for the notification's Stop button —
     * the same thing the overlay's own Stop does, because the two halves of one
     * alert must not answer differently.
     */
    stop: () => void,
  ) =>
  (alert: Alert): void => {
    try {
      surface.notify(notificationFor(alert, stop))
    } catch {
      /* empty */
    }
    surface.showOverlay(alert)
  }
