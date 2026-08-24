import { PUSH } from '../../shared/ipc'
import type { Preset } from '../../shared/preset'
import type { ReminderView } from '../../shared/reminder'
import type { SportsView } from '../../shared/sport'
import type { TimerUpdate } from '../timer/service'

/** The slice of a window's webContents the broadcaster needs. */
export type ViewTarget = {
  readonly isDestroyed: () => boolean
  readonly send: (channel: string, payload?: unknown) => void
}

/**
 * Everything main pushes to whichever windows are open, in one place.
 *
 * One module owning all three subscriptions is what keeps them symmetrical: a
 * fourth thing a window has to keep fresh is one source here, not a new
 * subscription somewhere in the bootstrap and a new listener in a component.
 */
export type BroadcastSources = {
  readonly timer: {
    readonly subscribe: (listener: (update: TimerUpdate) => void) => () => void
  }
  readonly presets: {
    readonly subscribe: (
      listener: (presets: readonly Preset[]) => void,
    ) => () => void
  }
  readonly history: {
    readonly subscribe: (listener: () => void) => () => void
  }
  /** A different log than `history`, but the same "a line landed, re-read" cue. */
  readonly reminderHistory: {
    readonly subscribe: (listener: () => void) => () => void
  }
  readonly reminders: {
    readonly subscribe: (
      listener: (reminders: readonly ReminderView[]) => void,
    ) => () => void
  }
  /** Another log, another "a line landed, re-read" cue — see `reminderHistory`. */
  readonly sportsHistory: {
    readonly subscribe: (listener: () => void) => () => void
  }
  readonly sports: {
    readonly subscribe: (listener: (view: SportsView) => void) => () => void
  }
}

export type ViewBroadcaster = {
  readonly register: (target: ViewTarget) => void
  readonly unregister: (target: ViewTarget) => void
  readonly targetCount: () => number
  readonly dispose: () => void
}

/**
 * Fans main's updates out to whichever windows are open.
 *
 * One subscription per source serves every window, so opening and closing the
 * settings window cannot leave listeners behind on the timer. A window that has
 * been destroyed without unregistering — a crash, a race with `closed` — is
 * dropped on the next update rather than being sent to, because `send()` on
 * destroyed webContents throws.
 */
export const createViewBroadcaster = (
  sources: BroadcastSources,
): ViewBroadcaster => {
  const targets = new Set<ViewTarget>()

  const push = (channel: string, payload?: unknown): void => {
    for (const target of targets) {
      if (target.isDestroyed()) {
        targets.delete(target)
        continue
      }
      target.send(channel, payload)
    }
  }

  const unsubscribes = [
    sources.timer.subscribe(({ view }) => push(PUSH.timerView, view)),
    sources.presets.subscribe((presets) => push(PUSH.presets, presets)),
    sources.history.subscribe(() => push(PUSH.historyChanged)),
    sources.reminderHistory.subscribe(() => push(PUSH.historyChanged)),
    sources.reminders.subscribe((reminders) => push(PUSH.reminders, reminders)),
    sources.sportsHistory.subscribe(() => push(PUSH.historyChanged)),
    sources.sports.subscribe((view) => push(PUSH.sports, view)),
  ]

  return {
    register: (target) => {
      targets.add(target)
    },
    unregister: (target) => {
      targets.delete(target)
    },
    targetCount: () => targets.size,
    dispose: () => {
      for (const unsubscribe of unsubscribes) unsubscribe()
      targets.clear()
    },
  }
}
