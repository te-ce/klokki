import type { NotificationText } from '../alert/notification'
import type { ReminderAlert } from '../../shared/reminder-alert'

/** The platform half of a reminder alert: a notification, and the overlay window. */
export type ReminderAlertSurface = {
  readonly notify: (text: NotificationText) => void
  readonly showOverlay: (alert: ReminderAlert) => void
}

const reminderNotificationFor = (alert: ReminderAlert): NotificationText => ({
  title: alert.label,
  body: alert.unit
    ? `Log how many ${alert.unit}, or snooze it.`
    : 'Mark it done, or snooze it.',
})

/**
 * Both halves of a reminder alert, for the same reason a phase transition gets
 * both (see alert/present.ts): the notification is missed under Do Not Disturb
 * or a fullscreen app, so the overlay is shown even when the notification fails.
 */
export const createReminderAlertPresenter =
  (surface: ReminderAlertSurface) =>
  (alert: ReminderAlert): void => {
    try {
      surface.notify(reminderNotificationFor(alert))
    } catch {
      /* empty */
    }
    surface.showOverlay(alert)
  }
