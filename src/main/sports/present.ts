import type { NotificationText } from '../alert/notification'
import type { SportsAlert } from '../../shared/sports-alert'

/** The platform half of a Sports alert — mirrors `ReminderAlertSurface`. */
export type SportsAlertSurface = {
  readonly notify: (text: NotificationText) => void
  /** Takes the last notification back — see `AlertSurface.withdraw`. */
  readonly withdraw: () => void
  readonly showOverlay: (alert: SportsAlert) => void
}

const sportsNotificationFor = (
  alert: SportsAlert,
  stop: () => void,
): NotificationText => ({
  title: 'Sports',
  body: `Log your ${alert.activities.map((a) => a.name).join(', ')}, or snooze it.`,
  actions: [{ label: 'Stop Sports', run: stop }],
})

/**
 * Both halves of a Sports alert, for the same reason a reminder gets both:
 * the notification is missed under Do Not Disturb or a fullscreen app, so
 * the overlay is shown even when the notification fails.
 */
export const createSportsAlertPresenter =
  (
    surface: SportsAlertSurface,
    /** Stops Sports and closes the overlay — see `createAlertPresenter`. */
    stop: () => void,
  ) =>
  (alert: SportsAlert): void => {
    try {
      surface.notify(sportsNotificationFor(alert, stop))
    } catch {
      /* empty */
    }
    surface.showOverlay(alert)
  }
