import type { SportsService } from './service'
import type { SportStore } from './store'

/**
 * Starting Sports from the tray — the single-schedule counterpart to
 * `startReminderById`. Enables it if it was off, then schedules one full
 * interval from now, so starting an already-running schedule restarts it —
 * "Restart" in the same menu.
 */
export const startSports = (
  store: SportStore,
  service: SportsService,
): void => {
  const settings = store.get()
  if (!settings.enabled) store.save({ ...settings, enabled: true })
  service.start()
}

/**
 * Firing Sports right now from the tray — "Log Sports Now", for logging an
 * activity without waiting for the schedule. Enables it if it was off, the
 * same as `startSports`: firing once is still a commitment to the ones that
 * follow. The overlay it raises is answered exactly like a scheduled one, so
 * confirming it restarts the interval from that moment for free.
 */
export const fireSportsNow = (
  store: SportStore,
  service: SportsService,
): boolean => {
  const settings = store.get()
  if (!settings.enabled) store.save({ ...settings, enabled: true })
  return service.fireNow()
}

/**
 * Stopping Sports from the tray. Disabling is enough on its own — the
 * store's subscriber in wire.ts already feeds every save through
 * `service.setSettings`, which drops the schedule the same way a disabled
 * reminder does.
 */
export const stopSports = (store: SportStore): void => {
  const settings = store.get()
  if (!settings.enabled) return
  store.save({ ...settings, enabled: false })
}
