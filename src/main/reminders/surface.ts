import { Notification } from 'electron'
import { openReminderOverlayWindow } from '../windows'
import type { ReminderAlertSurface } from './present'

/** The platform behind a reminder alert — the reminder counterpart to alert/surface.ts. */
export const electronReminderAlertSurface = (): ReminderAlertSurface => ({
  notify: (text) => {
    if (!Notification.isSupported()) return
    new Notification(text).show()
  },
  showOverlay: openReminderOverlayWindow,
})
