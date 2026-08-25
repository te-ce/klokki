import type { DayStats } from '../../shared/history'
import { hoursMinutes } from './format'
import { accentFor } from './week'

/**
 * Today's minutes as bars, at the same proportions the timer draws its phases in:
 * the longest label fills the row and the rest are read against it. Scaled to the
 * day's own maximum rather than to a fixed ceiling — the point is the ratio
 * between the labels, and a day with two ten-minute stretches has one too.
 *
 * The colour comes from the week's ranking of the label, not from this day's
 * order, so a label keeps its accent in every row of the pane.
 */
export const DayBars = ({
  day,
  labels,
}: {
  day: DayStats
  labels: readonly string[]
}) => {
  const longest = Math.max(...day.minutesByLabel.map((entry) => entry.minutes))

  return (
    <div className="flex flex-col gap-1.5">
      {day.minutesByLabel.map((entry) => (
        <div key={entry.label} className="flex items-center gap-2.5">
          <span className="text-ink-dim w-18 truncate text-[11px]">
            {entry.label}
          </span>
          <div className="bg-track h-1.5 flex-1 overflow-hidden rounded-sm">
            <div
              style={{ width: `${(entry.minutes / longest) * 100}%` }}
              className={`h-full ${accentFor(labels, entry.label)}`}
            />
          </div>
          <span className="text-ink-dim w-13 text-right text-[11px] tabular-nums">
            {hoursMinutes(entry.minutes)}
          </span>
        </div>
      ))}
    </div>
  )
}
