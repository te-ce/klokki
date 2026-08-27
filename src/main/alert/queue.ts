import type { Alert } from '../../shared/alert'

/**
 * At most one transition overlay is ever open — the window is one per kind, and
 * a new boundary supersedes the last one (see windows.ts) — so boundaries raised
 * while one is on screen wait their turn instead of being lost.
 *
 * They cannot simply be dropped: a boundary holds its run until it is answered
 * (see AGENTS.md), so an alert nobody ever sees would leave a run parked with
 * only the tray to explain it. And they cannot stack: two overlays would each
 * need dismissing, above everything, one hiding the other.
 *
 * At most one entry per run, because a run has at most one unanswered boundary:
 * nothing behind one has elapsed.
 */
export type AlertQueueState = {
  readonly current: Alert | null
  readonly pending: readonly Alert[]
}

export const EMPTY_ALERT_QUEUE: AlertQueueState = {
  current: null,
  pending: [],
}

export type AlertQueueResult = {
  readonly state: AlertQueueState
  /** The alert to present now, or null when nothing new should be shown. */
  readonly toShow: Alert | null
}

/** Adds newly-raised alerts, showing the first only if nothing is showing. */
export const enqueueAlerts = (
  state: AlertQueueState,
  alerts: readonly Alert[],
): AlertQueueResult => {
  if (alerts.length === 0) return { state, toShow: null }

  // A run that already has an entry is raising a fresh boundary for it — it was
  // stopped and restarted — and the new one is the only answerable version.
  const runIds = new Set(alerts.map((alert) => alert.runId))
  const kept = state.pending.filter((alert) => !runIds.has(alert.runId))

  if (state.current !== null && !runIds.has(state.current.runId))
    return { state: { ...state, pending: [...kept, ...alerts] }, toShow: null }

  const [first, ...rest] = alerts
  if (!first) return { state, toShow: null }
  return {
    state: { current: first, pending: [...kept, ...rest] },
    toShow: first,
  }
}

export type AlertAnswerResult = AlertQueueResult & {
  /**
   * Whether the alert on screen was this run's, and so has to be voided.
   *
   * A boundary answered from the tray or the Timer pane while another run's
   * overlay is up is answered all the same — it just leaves that overlay alone,
   * because it is announcing something still perfectly answerable.
   */
  readonly voided: boolean
}

/**
 * A run's boundary has been answered, or the run has stopped — either way it has
 * nothing left to announce, so its alert leaves the queue wherever it was and
 * whatever is behind it comes forward.
 *
 * Answering and stopping are the same move here: both mean "this run no longer
 * has an unanswered boundary", which is the only thing the queue is tracking.
 */
export const answerAlert = (
  state: AlertQueueState,
  runId: string,
): AlertAnswerResult => {
  if (state.current === null || state.current.runId !== runId)
    return {
      state: {
        ...state,
        pending: state.pending.filter((alert) => alert.runId !== runId),
      },
      toShow: null,
      voided: false,
    }

  const [next, ...rest] = state.pending
  return {
    state: { current: next ?? null, pending: rest },
    toShow: next ?? null,
    voided: true,
  }
}
