import type { Alert } from '../../shared/alert'
import { notificationFor, type NotificationText } from './notification'

/** The platform half of an alert: a notification, and the overlay window. */
export type AlertSurface = {
  readonly notify: (text: NotificationText) => void
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
  (surface: AlertSurface) =>
  (alert: Alert): void => {
    try {
      surface.notify(notificationFor(alert))
    } catch {
      /* empty */
    }
    surface.showOverlay(alert)
  }
