import type { NotificationText } from '../alert/notification'
import type { ReminderAlert } from '../../shared/reminder-alert'

/** The platform half of a reminder alert: a notification, and the overlay window. */
export type ReminderAlertSurface = {
  readonly notify: (text: NotificationText) => void
  /** Takes the last notification back — see `AlertSurface.withdraw`. */
  readonly withdraw: () => void
  readonly showOverlay: (alert: ReminderAlert) => void
}

const reminderNotificationFor = (
  alert: ReminderAlert,
  stop: () => void,
): NotificationText => ({
  title: alert.label,
  body: alert.unit
    ? `Log how many ${alert.unit}, or snooze it.`
    : 'Mark it done, or snooze it.',
  actions: [{ label: 'Stop Reminder', run: stop }],
})

/**
 * Both halves of a reminder alert, for the same reason a phase transition gets
 * both (see alert/present.ts): the notification is missed under Do Not Disturb
 * or a fullscreen app, so the overlay is shown even when the notification fails.
 */
export const createReminderAlertPresenter =
  (
    surface: ReminderAlertSurface,
    /**
     * Stops the reminder this alert is showing and closes the overlay — the
     * controller's own Stop, so the notification's button and the overlay's
     * cannot drift apart. It stops whatever is showing when it is clicked,
     * which is the only reminder the notification can be about.
     */
    stop: () => void,
  ) =>
  (alert: ReminderAlert): void => {
    try {
      surface.notify(reminderNotificationFor(alert, stop))
    } catch {
      /* empty */
    }
    surface.showOverlay(alert)
  }
