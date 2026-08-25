/**
 * How the stats pane says a length of time, and how it names a day.
 *
 * The day string is already a local calendar day (see src/main/history/stats.ts),
 * so it is formatted from a UTC anchor in UTC: reading `2026-08-19` back through
 * the host's zone would land it on the 18th anywhere west of Greenwich, and name
 * the wrong weekday for it.
 */
const DAY = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
})

/** `2026-08-19` as `Wed 19`. */
export const dayLabel = (day: string): string => {
  const [year = NaN, month = NaN, date = NaN] = day.split('-').map(Number)
  return DAY.format(Date.UTC(year, month - 1, date))
}

/**
 * Minutes as hours and minutes — `2h 15m`, `45m`, `3h`.
 *
 * Not `2:15`: the countdown elsewhere in the app is minutes and seconds at that
 * shape, and a total that reads as a clock is a total read wrong.
 */
export const hoursMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}m`
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}
