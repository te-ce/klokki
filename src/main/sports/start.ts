import type { SportsHistoryEvent } from '../../shared/sports-history'
import { systemClock, type Clock } from '../timer/clock'
import type { SportsService } from './service'
import type { SportStore } from './store'

/**
 * Starting Sports from the tray. Enables it if it was off, then schedules one
 * full interval from now, so starting an already-running schedule restarts
 * it — "Restart" in the same menu.
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
 * Logging Sports activity from the tab, independent of the overlay and the
 * running schedule — every activity with a number given is appended to
 * history regardless of whether Sports is on. Unlike `startSports` and
 * `fireSportsNow`, a manual log never turns Sports on and never schedules it
 * from nothing: logging a set of pushups when Sports was never running is
 * not "starting" anything. It only restarts the interval — the same full
 * reset `startSports` gives an already-running schedule — when Sports was
 * already scheduled before this log, so an activity logged mid-interval
 * counts as the interval's round and the next one waits its full length
 * again, matching what confirming an overlay would have done.
 */
export const logSports = (
  store: SportStore,
  service: SportsService,
  record: (event: SportsHistoryEvent) => void,
  quantities: Readonly<Record<string, number>>,
  clock: Clock = systemClock,
): void => {
  const wasScheduled = service.getState().scheduled
  const loggedAt = clock.now()
  for (const activity of store.get().activities) {
    const quantity = quantities[activity.id]
    if (quantity === undefined) continue
    record({
      loggedAt,
      activityId: activity.id,
      activityLabel: activity.name,
      quantity,
    })
  }
  if (wasScheduled) service.start()
}

/**
 * Stopping Sports from the tray. Disabling is enough on its own — the
 * store's subscriber in wire.ts already feeds every save through
 * `service.setSettings`, which drops the schedule.
 */
export const stopSports = (store: SportStore): void => {
  const settings = store.get()
  if (!settings.enabled) return
  store.save({ ...settings, enabled: false })
}
