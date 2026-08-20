import type { DayStats } from '../../shared/history'

/** The two accents alternate down the list, so one label is told from the next. */
const BAR = ['bg-work', 'bg-rest'] as const

/**
 * Today's minutes as bars, at the same proportions the timer draws its phases in:
 * the longest label fills the row and the rest are read against it. Scaled to the
 * day's own maximum rather than to a fixed ceiling — the point is the ratio
 * between the labels, and a day with two ten-minute stretches has one too.
 */
export const DayBars = ({ day }: { day: DayStats }) => {
  const longest = Math.max(...day.minutesByLabel.map((entry) => entry.minutes))

  return (
    <div className="flex flex-col gap-1.5">
      {day.minutesByLabel.map((entry, index) => (
        <div key={entry.label} className="flex items-center gap-2.5">
          <span className="text-ink-dim w-18 truncate text-[11px]">
            {entry.label}
          </span>
          <div className="bg-track h-1.5 flex-1 overflow-hidden rounded-sm">
            <div
              style={{ width: `${(entry.minutes / longest) * 100}%` }}
              className={`h-full ${BAR[index % BAR.length]}`}
            />
          </div>
          <span className="text-ink-dim w-10 text-right text-[11px] tabular-nums">
            {entry.minutes}m
          </span>
        </div>
      ))}
    </div>
  )
}
