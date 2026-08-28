import { MS_PER_MINUTE } from '../../shared/preset'
import type { SportSettings } from '../../shared/sport'

/**
 * Sports' live schedule: whether it is scheduled at all, and when it next
 * fires. There is only ever one Sports schedule, not many independent
 * definitions, so this carries no id and no step cursor.
 */
export type SportRunState = {
  readonly scheduled: boolean
  /**
   * When Sports fires — or null while the last firing is still unanswered.
   *
   * The next interval does not start on its own: answering is what starts it.
   */
  readonly nextFireAt: number | null
}

export const STOPPED: SportRunState = { scheduled: false, nextFireAt: null }

const intervalMs = (settings: SportSettings): number =>
  settings.intervalMinutes * MS_PER_MINUTE

/** A freshly enabled Sports schedule's first firing, one interval out. */
export const scheduleAt = (
  settings: SportSettings,
  now: number,
): SportRunState => ({
  scheduled: true,
  nextFireAt: now + intervalMs(settings),
})

export type SportsTickResult = {
  readonly state: SportRunState
  /** Whether Sports came due this tick. */
  readonly fired: boolean
}

/**
 * Fires Sports at most once, then waits for its answer — "ask once however
 * long it's been", for a firing that came due while the app was closed.
 *
 * Not scheduled, disabled, or with no activities to ask about: nothing to
 * fire, and the schedule is dropped rather than left dangling.
 */
export const tick = (
  state: SportRunState,
  settings: SportSettings,
  now: number,
): SportsTickResult => {
  if (!state.scheduled || !settings.enabled || settings.activities.length === 0)
    return { state: STOPPED, fired: false }

  if (state.nextFireAt === null || state.nextFireAt > now)
    return { state, fired: false }

  return { state: { scheduled: true, nextFireAt: null }, fired: true }
}

/**
 * Starts the next interval after a firing was answered — the Sports half of
 * the timer's `confirm`. Only moves a run that is actually waiting: an
 * answer to an overlay already superseded must not move a live schedule.
 */
export const withConfirmed = (
  state: SportRunState,
  settings: SportSettings,
  now: number,
): SportRunState =>
  state.scheduled && state.nextFireAt === null
    ? scheduleAt(settings, now)
    : state

/** Drops the schedule — for a stop or a disable. */
export const withRemoved = (): SportRunState => STOPPED

/**
 * Forces an immediate firing — the tray's "Log Sports Now", answering the
 * same way a scheduled firing does. A firing already awaiting an answer is
 * left alone: there is already an overlay to answer, and firing again would
 * not open a second one, only lose the reference the first was raised with.
 * Whether the settings are runnable at all is the caller's guard, the same
 * split `start` in `service.ts` makes around `scheduleAt`.
 */
export const fireNow = (state: SportRunState): SportRunState =>
  state.scheduled && state.nextFireAt === null
    ? state
    : { scheduled: true, nextFireAt: null }

/**
 * Defers a waiting firing by `extraMs`. A no-op when nothing is waiting —
 * there is no boundary to defer.
 */
export const snooze = (
  state: SportRunState,
  now: number,
  extraMs: number,
): SportRunState =>
  state.scheduled && state.nextFireAt === null
    ? { scheduled: true, nextFireAt: now + extraMs }
    : state

/**
 * Corrects the running countdown to `targetMs` — the Sports counterpart to
 * the timer's `setRemaining`. A no-op while awaiting an answer or
 * unscheduled: there is no countdown to correct. `targetMs` is clamped to
 * zero rather than rejected, the same as the timer's version.
 */
export const setRemaining = (
  state: SportRunState,
  now: number,
  targetMs: number,
): SportRunState =>
  state.scheduled && state.nextFireAt !== null
    ? { scheduled: true, nextFireAt: now + Math.max(0, targetMs) }
    : state

/**
 * Adds `extraMs` to the running countdown — the Sports counterpart to the
 * timer's `addTime`. A no-op while awaiting an answer or unscheduled, the
 * same guard `setRemaining` uses.
 */
export const addTime = (
  state: SportRunState,
  extraMs: number,
): SportRunState =>
  state.scheduled && state.nextFireAt !== null
    ? { scheduled: true, nextFireAt: state.nextFireAt + extraMs }
    : state
