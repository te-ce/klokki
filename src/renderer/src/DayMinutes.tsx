import type { DayStats } from '../../shared/history'

export const DayMinutes = ({ day }: { day: DayStats }) =>
  day.minutesByLabel.length === 0 ? (
    <span className="text-ink-hush">Nothing recorded</span>
  ) : (
    <span className="flex flex-wrap justify-end gap-x-3">
      {day.minutesByLabel.map((entry) => (
        <span key={entry.label} className="text-ink-dim">
          {entry.label} <span className="tabular-nums">{entry.minutes}m</span>
        </span>
      ))}
    </span>
  )
