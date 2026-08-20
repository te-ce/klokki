import { useEffect, useRef, useState } from 'react'
import type { DayStats, HistoryStats } from '../../shared/history'

const Minutes = ({ day }: { day: DayStats }) =>
  day.minutesByLabel.length === 0 ? (
    <span className="text-neutral-500">Nothing recorded</span>
  ) : (
    <span className="flex flex-wrap gap-x-3">
      {day.minutesByLabel.map((entry) => (
        <span key={entry.label}>
          {entry.label} <span className="tabular-nums">{entry.minutes}m</span>
        </span>
      ))}
    </span>
  )

/**
 * What actually happened, read back from the history log.
 *
 * The window is closed almost all of the time, so this fetches on mount rather
 * than subscribing to a stream of events; while it is open, a phase boundary is
 * the only thing that adds to the log, so the pushed timer view is the cue to
 * re-read — once per boundary, not once per second.
 */
export const StatsSection = () => {
  const [stats, setStats] = useState<HistoryStats | null>(null)
  const phase = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const read = (): void => {
      void window.klokki.getStats().then((next) => {
        if (!cancelled) setStats(next)
      })
    }

    read()
    const unsubscribe = window.klokki.onTimerView((view) => {
      if (view.phaseLabel === phase.current) return
      phase.current = view.phaseLabel
      read()
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  if (!stats) return null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">Stats</h2>

      <fieldset
        aria-label={`Today, ${stats.today.date}`}
        className="flex flex-col gap-1 rounded-md bg-neutral-800/50 p-3 text-sm"
      >
        <legend className="text-neutral-400">Today</legend>
        <span className="tabular-nums">
          {stats.today.completed}{' '}
          {stats.today.completed === 1 ? 'phase' : 'phases'}
        </span>
        <Minutes day={stats.today} />
      </fieldset>

      <ul className="flex flex-col gap-1 text-sm">
        {stats.days.map((day) => (
          <li key={day.date} className="flex justify-between gap-4">
            <span className="text-neutral-400 tabular-nums">{day.date}</span>
            <Minutes day={day} />
          </li>
        ))}
      </ul>
    </section>
  )
}
