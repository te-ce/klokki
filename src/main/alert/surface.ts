import { Notification } from 'electron'
import { openOverlayWindow } from '../windows'
import type { AlertSurface } from './present'

/**
 * The platform behind an alert. The only module here that imports Electron, so
 * the wording and the both-halves rule can be tested without a display.
 */
export const electronAlertSurface = (): AlertSurface => ({
  notify: (text) => {
    if (!Notification.isSupported()) return
    new Notification(text).show()
  },
  showOverlay: openOverlayWindow,
})
