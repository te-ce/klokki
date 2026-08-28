import { createNotifier } from '../alert/notify'
import { openSportsOverlayWindow } from '../windows'
import type { SportsAlertSurface } from './present'

/** The platform behind a Sports alert — mirrors `electronAlertSurface`. */
export const electronSportsAlertSurface = (): SportsAlertSurface => {
  const notifier = createNotifier()
  return {
    notify: notifier.notify,
    withdraw: notifier.withdraw,
    showOverlay: openSportsOverlayWindow,
  }
}
