import { Notification } from 'electron'
import { openSportsOverlayWindow } from '../windows'
import type { SportsAlertSurface } from './present'

/** The platform behind a Sports alert — mirrors `electronReminderAlertSurface`. */
export const electronSportsAlertSurface = (): SportsAlertSurface => ({
  notify: (text) => {
    if (!Notification.isSupported()) return
    new Notification(text).show()
  },
  showOverlay: openSportsOverlayWindow,
})
