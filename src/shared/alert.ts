/**
 * What the user is told when a phase ends, and how it reaches the overlay.
 *
 * The overlay is a window whose whole content is one alert, so the alert travels
 * in the URL the window is opened with rather than over a channel: a renderer
 * reading its own location cannot race the push that would otherwise have to
 * arrive after the page loads.
 */

export type Alert = {
  /**
   * The run whose boundary this is — the id of the preset it is running.
   *
   * Several presets run at once, so an overlay that only said which phase ended
   * could not be answered: Snooze, the affirmative and Stop all have to reach
   * one run. It travels in the URL with the rest of the alert, so the window
   * knows which run it is about before its first render.
   */
  readonly runId: string
  readonly completedLabel: string
  /** null when the preset ran out of phases: nothing is starting now. */
  readonly nextLabel: string | null
}

export const OVERLAY_ROUTE = '/overlay'

export const alertRoute = (alert: Alert): string => {
  const params = new URLSearchParams({
    run: alert.runId,
    completed: alert.completedLabel,
  })
  if (alert.nextLabel !== null) params.set('next', alert.nextLabel)
  return `${OVERLAY_ROUTE}?${params.toString()}`
}

/** Reads an alert out of a `window.location.hash`, or null for any other view. */
export const alertFromRoute = (hash: string): Alert | null => {
  const route = hash.startsWith('#') ? hash.slice(1) : hash
  const [path, query] = route.split('?')
  if (path !== OVERLAY_ROUTE) return null

  const params = new URLSearchParams(query ?? '')
  const runId = params.get('run')
  const completedLabel = params.get('completed')
  // Both or neither: an overlay that knew the phase but not the run would draw
  // controls that could not answer anything.
  if (runId === null || completedLabel === null) return null

  return { runId, completedLabel, nextLabel: params.get('next') }
}
