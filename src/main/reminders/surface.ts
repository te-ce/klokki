import { showNotification } from '../alert/notify'
import { openReminderOverlayWindow } from '../windows'
import type { ReminderAlertSurface } from './present'

/** The platform behind a reminder alert — the reminder counterpart to alert/surface.ts. */
export const electronReminderAlertSurface = (): ReminderAlertSurface => ({
  notify: showNotification,
  showOverlay: openReminderOverlayWindow,
})
