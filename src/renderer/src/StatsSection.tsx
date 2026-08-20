import { useEffect, useState } from 'react'
import type { DayStats, HistoryStats } from '../../shared/history'

/** The two accents alternate down the list, so one label is told from the next. */
const BAR = ['bg-work', 'bg-rest'] as const

const Minutes = ({ day }: { day: DayStats }) =>
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

/**
 * Today's minutes as bars, at the same proportions the timer draws its phases in:
 * the longest label fills the row and the rest are read against it. Scaled to the
 * day's own maximum rather than to a fixed ceiling — the point is the ratio
 * between the labels, and a day with two ten-minute stretches has one too.
 */
const Bars = ({ day }: { day: DayStats }) => {
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

/**
 * What actually happened, read back from the history log.
 *
 * The window is closed almost all of the time, so this fetches on mount rather
 * than subscribing to a stream of events, and re-reads when the main process says
 * a line was written — once per stretch, not once per second.
 *
 * The cue is the append itself and not the pushed timer view: "the phase label
 * changed" is a different predicate, and misses a snooze and two phases that
 * share a label. Which stretches end, and when, is the main process's to know.
 */
export const StatsSection = () => {
  const [stats, setStats] = useState<HistoryStats | null>(null)

  useEffect(() => {
    let cancelled = false
    const read = (): void => {
      void window.klokki.getStats().then((next) => {
        if (!cancelled) setStats(next)
      })
    }

    read()
    const unsubscribe = window.klokki.onHistoryChanged(read)

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  if (!stats) return null

  return (
    <section className="flex flex-1 flex-col gap-4">
      <fieldset
        aria-label={`Today, ${stats.today.date}`}
        className="bg-panel border-line flex flex-col gap-3 rounded-[9px] border p-3.5"
      >
        <legend className="sr-only">Today</legend>
        <div className="flex items-baseline gap-2">
          <span className="text-ink-faint text-[11px] tracking-[0.08em] uppercase">
            Today
          </span>
          {/* One text node, because it is one thing to read: a count is
              meaningless without the noun it counts. */}
          <span className="text-ink-soft ml-auto text-xs tabular-nums">
            {`${stats.today.completed} ${
              stats.today.completed === 1 ? 'phase' : 'phases'
            }`}
          </span>
        </div>
        {stats.today.minutesByLabel.length === 0 ? (
          <span className="text-ink-hush text-[11px]">Nothing recorded</span>
        ) : (
          <Bars day={stats.today} />
        )}
      </fieldset>

      <div className="flex flex-col gap-2">
        <h2 className="text-ink-faint text-[11px] tracking-[0.08em] uppercase">
          Last 7 days
        </h2>
        <ul className="border-line flex flex-col overflow-hidden rounded-[9px] border">
          {stats.days.map((day) => (
            <li
              key={day.date}
              className="border-line flex items-baseline justify-between gap-4 border-b px-3 py-2 text-[11px] last:border-b-0"
            >
              <span className="text-ink-faint tabular-nums">{day.date}</span>
              <Minutes day={day} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
