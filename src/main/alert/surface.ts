import { openOverlayWindow } from '../windows'
import { showNotification } from './notify'
import type { AlertSurface } from './present'

/**
 * The platform behind an alert: a window, and the native notification (which is
 * Electron-shaped enough to have its own module, notify.ts). Nothing here
 * decides anything, so the wording and the both-halves rule stay testable
 * without a display.
 */
export const electronAlertSurface = (): AlertSurface => ({
  notify: showNotification,
  showOverlay: openOverlayWindow,
})
