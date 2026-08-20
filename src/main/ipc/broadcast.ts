import { IPC } from '../../shared/ipc'
import type { TimerUpdate } from '../timer/service'

/** The slice of a window's webContents the broadcaster needs. */
export type ViewTarget = {
  readonly isDestroyed: () => boolean
  readonly send: (channel: string, view: unknown) => void
}

type ViewSource = {
  readonly subscribe: (listener: (update: TimerUpdate) => void) => () => void
}

export type ViewBroadcaster = {
  readonly register: (target: ViewTarget) => void
  readonly unregister: (target: ViewTarget) => void
  readonly targetCount: () => number
  readonly dispose: () => void
}

/**
 * Fans the timer's updates out to whichever windows are open.
 *
 * One subscription to the timer serves every window, so opening and closing the
 * settings window cannot leave listeners behind on the service. A window that
 * has been destroyed without unregistering — a crash, a race with `closed` — is
 * dropped on the next update rather than being sent to, because `send()` on
 * destroyed webContents throws.
 */
export const createViewBroadcaster = (source: ViewSource): ViewBroadcaster => {
  const targets = new Set<ViewTarget>()

  const unsubscribe = source.subscribe(({ view }) => {
    for (const target of targets) {
      if (target.isDestroyed()) {
        targets.delete(target)
        continue
      }
      target.send(IPC.timerView, view)
    }
  })

  return {
    register: (target) => {
      targets.add(target)
    },
    unregister: (target) => {
      targets.delete(target)
    },
    targetCount: () => targets.size,
    dispose: () => {
      unsubscribe()
      targets.clear()
    },
  }
}
