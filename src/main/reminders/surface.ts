import { createNotifier } from '../alert/notify'
import { openReminderOverlayWindow } from '../windows'
import type { ReminderAlertSurface } from './present'

/** The platform behind a reminder alert — the reminder counterpart to alert/surface.ts. */
export const electronReminderAlertSurface = (): ReminderAlertSurface => {
  const notifier = createNotifier()
  return {
    notify: notifier.notify,
    withdraw: notifier.withdraw,
    showOverlay: openReminderOverlayWindow,
  }
}
