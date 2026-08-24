import type { NotificationText } from '../alert/notification'
import type { SportsAlert } from '../../shared/sports-alert'

/** The platform half of a Sports alert — mirrors `ReminderAlertSurface`. */
export type SportsAlertSurface = {
  readonly notify: (text: NotificationText) => void
  readonly showOverlay: (alert: SportsAlert) => void
}

const sportsNotificationFor = (alert: SportsAlert): NotificationText => ({
  title: 'Sports',
  body: `Log your ${alert.activities.map((a) => a.name).join(', ')}, or snooze it.`,
})

/**
 * Both halves of a Sports alert, for the same reason a reminder gets both:
 * the notification is missed under Do Not Disturb or a fullscreen app, so
 * the overlay is shown even when the notification fails.
 */
export const createSportsAlertPresenter =
  (surface: SportsAlertSurface) =>
  (alert: SportsAlert): void => {
    try {
      surface.notify(sportsNotificationFor(alert))
    } catch {
      /* empty */
    }
    surface.showOverlay(alert)
  }
