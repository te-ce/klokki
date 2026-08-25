/**
 * What the user is told when Sports comes due, and how it reaches the
 * overlay — the Sports counterpart to shared/reminder-alert.ts. It carries a
 * list rather than a single label+unit, because every activity is logged in
 * one firing, so the activity list is JSON-encoded into the query string
 * instead of flat params.
 */

export type SportsAlertActivity = {
  readonly id: string
  readonly name: string
}

export type SportsAlert = {
  readonly activities: readonly SportsAlertActivity[]
}

/** Matches `REMINDER_SNOOZE_MINUTES_OPTIONS` — the same fixed increments. */
export const SPORTS_SNOOZE_MINUTES_OPTIONS = [5, 10, 15, 30] as const

export const SPORTS_OVERLAY_ROUTE = '/sports-overlay'

const isSportsAlertActivity = (value: unknown): value is SportsAlertActivity =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof value.id === 'string' &&
  'name' in value &&
  typeof value.name === 'string'

export const sportsAlertRoute = (alert: SportsAlert): string => {
  const params = new URLSearchParams({
    activities: JSON.stringify(alert.activities),
  })
  return `${SPORTS_OVERLAY_ROUTE}?${params.toString()}`
}

/** Reads a Sports alert out of a `window.location.hash`, or null for any other view. */
export const sportsAlertFromRoute = (hash: string): SportsAlert | null => {
  const route = hash.startsWith('#') ? hash.slice(1) : hash
  const [path, query] = route.split('?')
  if (path !== SPORTS_OVERLAY_ROUTE) return null

  const params = new URLSearchParams(query ?? '')
  const raw = params.get('activities')
  if (raw === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || !parsed.every(isSportsAlertActivity))
    return null

  return { activities: parsed }
}
