/**
 * A start/stop wrapper around `setInterval`, shared by every service that polls
 * a pure state machine on a clock (see `timer/service.ts`, `sports/service.ts`).
 * `start` is idempotent — restarting an already-running poll would leak the old
 * interval — and `stop` is safe to call whether or not one is running.
 */
export type Poller = {
  readonly running: () => boolean
  readonly start: () => void
  readonly stop: () => void
}

export const createPoller = (intervalMs: number, tick: () => void): Poller => {
  let handle: ReturnType<typeof setInterval> | null = null

  return {
    running: () => handle !== null,
    start: () => {
      if (handle !== null) return
      handle = setInterval(tick, intervalMs)
    },
    stop: () => {
      if (handle === null) return
      clearInterval(handle)
      handle = null
    },
  }
}
