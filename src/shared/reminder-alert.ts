/**
 * What the user is told when a reminder comes due, and how it reaches the
 * overlay — the reminder counterpart to shared/alert.ts. It travels in the
 * URL the window is opened with for the same reason: a renderer reading its
 * own location cannot race the push that would otherwise have to arrive after
 * the page loads.
 */

export type ReminderAlert = {
  readonly label: string
  /** null for a step with no quantity to log. */
  readonly unit: string | null
}

/** The fixed snooze increments the overlay offers, matching the phase overlay's TIMER_SNOOZE_MINUTES_OPTIONS convention. */
export const REMINDER_SNOOZE_MINUTES_OPTIONS = [5, 10, 15, 30] as const

export const REMINDER_OVERLAY_ROUTE = '/reminder-overlay'

export const reminderAlertRoute = (alert: ReminderAlert): string => {
  const params = new URLSearchParams({ label: alert.label })
  if (alert.unit !== null) params.set('unit', alert.unit)
  return `${REMINDER_OVERLAY_ROUTE}?${params.toString()}`
}

/** Reads a reminder alert out of a `window.location.hash`, or null for any other view. */
export const reminderAlertFromRoute = (hash: string): ReminderAlert | null => {
  const route = hash.startsWith('#') ? hash.slice(1) : hash
  const [path, query] = route.split('?')
  if (path !== REMINDER_OVERLAY_ROUTE) return null

  const params = new URLSearchParams(query ?? '')
  const label = params.get('label')
  if (label === null) return null

  return { label, unit: params.get('unit') }
}
