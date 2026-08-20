/**
 * What the user is told when a phase ends, and how it reaches the overlay.
 *
 * The overlay is a window whose whole content is one alert, so the alert travels
 * in the URL the window is opened with rather than over a channel: a renderer
 * reading its own location cannot race the push that would otherwise have to
 * arrive after the page loads.
 */

export type Alert = {
  readonly completedLabel: string
  /** null when the preset ran out of phases: nothing is starting now. */
  readonly nextLabel: string | null
}

export const OVERLAY_ROUTE = '/overlay'

export const alertRoute = (alert: Alert): string => {
  const params = new URLSearchParams({ completed: alert.completedLabel })
  if (alert.nextLabel !== null) params.set('next', alert.nextLabel)
  return `${OVERLAY_ROUTE}?${params.toString()}`
}

/** Reads an alert out of a `window.location.hash`, or null for any other view. */
export const alertFromRoute = (hash: string): Alert | null => {
  const route = hash.startsWith('#') ? hash.slice(1) : hash
  const [path, query] = route.split('?')
  if (path !== OVERLAY_ROUTE) return null

  const params = new URLSearchParams(query ?? '')
  const completedLabel = params.get('completed')
  if (completedLabel === null) return null

  return { completedLabel, nextLabel: params.get('next') }
}
