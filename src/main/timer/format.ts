const pad = (value: number): string => String(value).padStart(2, '0')

/**
 * Renders remaining milliseconds for the menubar: `04:31`, or `1:12:09` once an
 * hour or more is left. Rounds up, so a fresh 25-minute phase reads `25:00`
 * rather than `24:59`.
 */
export const formatRemaining = (remainingMs: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`
}
