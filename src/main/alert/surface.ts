import { openOverlayWindow } from '../windows'
import { createNotifier } from './notify'
import type { AlertSurface } from './present'

/**
 * The platform behind an alert: a window, and the native notification (which is
 * Electron-shaped enough to have its own module, notify.ts). Nothing here
 * decides anything, so the wording, the both-halves rule and *when* an alert is
 * void all stay testable without a display.
 *
 * The notifier is this surface's own, so withdrawing the timer's notification
 * cannot take Sports' with it.
 */
export const electronAlertSurface = (): AlertSurface => {
  const notifier = createNotifier()
  return {
    notify: notifier.notify,
    withdraw: notifier.withdraw,
    showOverlay: openOverlayWindow,
  }
}
