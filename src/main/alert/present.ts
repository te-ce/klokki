import { Notification } from 'electron'
import type { Alert } from '../../shared/alert'
import { openOverlayWindow } from '../windows'

/**
 * Both halves of an alert, because either one alone is missable.
 *
 * The notification is what the user sees while working normally; the overlay is
 * what survives Do Not Disturb and a fullscreen app, which is where a "stand up"
 * nudge matters most (see AGENTS.md).
 */
export const presentAlert = (alert: Alert): void => {
  const next = alert.nextLabel ?? 'Timer finished'

  if (Notification.isSupported())
    new Notification({
      title: `${alert.completedLabel} finished`,
      body: alert.nextLabel === null ? next : `${next} starting now`,
    }).show()

  openOverlayWindow(alert)
}
