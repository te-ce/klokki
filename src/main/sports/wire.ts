import type { SportSettings } from '../../shared/sport'
import type { SportsAlert } from '../../shared/sports-alert'
import type { SportsHistoryEvent } from '../../shared/sports-history'
import { systemClock, type Clock } from '../timer/clock'

/** The slice of the Sports service and store the overlay needs. */
type SportsAlertSource = {
  readonly subscribe: (listener: () => void) => () => void
  readonly snooze: (extraMs: number) => boolean
  readonly confirm: () => boolean
  /**
   * The tray's stop path (`stopSports`) — a disable the store owns, after
   * which its subscriber drops the schedule, exactly as it does for a reminder.
   */
  readonly stop: () => void
}

type SportsAlertStore = {
  readonly get: () => SportSettings
}

export type SportsAlertController = {
  /** Defers Sports' current firing. False when nothing is showing. */
  readonly snooze: (extraMs: number) => boolean
  /**
   * Answers the current firing as done, with a quantity per activity id.
   * No-op when nothing is showing.
   */
  readonly confirm: (quantities: Readonly<Record<string, number>>) => void
  /**
   * Stops Sports and closes the overlay. No-op when nothing is showing — the
   * same guard Snooze and Done use, so an answer to an overlay already gone
   * cannot disable a schedule the user has since restarted.
   */
  readonly stop: () => void
  /**
   * Voids the alert showing when Sports is no longer running — for a stop that
   * came from the tray or the settings window rather than from the overlay.
   *
   * Told whether Sports is running rather than being asked to work it out: the
   * store's subscriber in wire.ts is holding the settings that just changed,
   * and every save goes through it, enabled or not.
   */
  readonly voidStopped: (running: boolean) => void
  readonly dispose: () => void
}

const toAlert = (settings: SportSettings): SportsAlert => ({
  activities: settings.activities.map(({ id, name }) => ({ id, name })),
})

/**
 * Turns the Sports service's firings into overlays — the single-schedule
 * counterpart to `wireReminderAlerts`. There is no queue: one schedule can
 * never have a second firing due while the first is still unanswered.
 *
 * Answering is also what starts the next interval — Done confirms it,
 * Snooze defers the same firing — the same "holds until answered" shape a
 * reminder gives its cycling steps.
 */
export const wireSportsAlerts = (
  source: SportsAlertSource,
  store: SportsAlertStore,
  present: (alert: SportsAlert) => void,
  /** Voids the alert showing — both halves of it (see alert/void.ts). */
  close: () => void,
  /** Appends one line per activity for every completed answer. */
  record: (event: SportsHistoryEvent) => void = () => {},
  clock: Clock = systemClock,
): SportsAlertController => {
  let showing = false

  const unsubscribe = source.subscribe(() => {
    showing = true
    present(toAlert(store.get()))
  })

  return {
    snooze: (extraMs) => {
      if (!showing) return false
      const snoozed = source.snooze(extraMs)
      showing = false
      close()
      return snoozed
    },
    stop: () => {
      if (!showing) return
      // Voided before the stop lands: disabling is a store write, and the
      // store's own subscriber (wire.ts) voids a showing alert once Sports is
      // off. Closing first leaves that subscriber nothing to do rather than a
      // second close.
      showing = false
      close()
      // Disabling drops the schedule (`setSettings` → `withRemoved`), so the
      // firing this overlay was showing is not left awaiting an answer that can
      // no longer arrive. Nothing is logged: a stop is not a round done.
      source.stop()
    },
    voidStopped: (running) => {
      if (running || !showing) return
      showing = false
      close()
    },
    confirm: (quantities) => {
      if (!showing) return
      const activities = store.get().activities
      // The interval that follows starts here, not at the boundary: Sports
      // waited for this answer, so the user gets a whole interval of it.
      source.confirm()
      const loggedAt = clock.now()
      for (const activity of activities) {
        record({
          loggedAt,
          activityId: activity.id,
          activityLabel: activity.name,
          quantity: quantities[activity.id] ?? 0,
        })
      }
      showing = false
      close()
    },
    dispose: unsubscribe,
  }
}
