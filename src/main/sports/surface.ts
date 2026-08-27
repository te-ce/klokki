import { showNotification } from '../alert/notify'
import { openSportsOverlayWindow } from '../windows'
import type { SportsAlertSurface } from './present'

/** The platform behind a Sports alert — mirrors `electronReminderAlertSurface`. */
export const electronSportsAlertSurface = (): SportsAlertSurface => ({
  notify: showNotification,
  showOverlay: openSportsOverlayWindow,
})
