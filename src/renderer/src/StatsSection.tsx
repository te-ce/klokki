import { useEffect, useState } from 'react'
import type { HistoryStats } from '../../shared/history'
import type { ReminderHistoryStats } from '../../shared/reminder-history'
import type { SportsHistoryStats } from '../../shared/sports-history'
import { DayBars } from './DayBars'
import { DaySpine } from './DaySpine'
import { dayLabel, hoursMinutes } from './format'
import { WeekTotals } from './WeekTotals'
import { accentFor, zipWeek } from './week'

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
 *
 * The three logs are drawn as one week rather than as three lists of their own
 * (`zipWeek`): the day a stretch of standing landed on is the day the pushups
 * did or did not, and reading that off two lists of `YYYY-MM-DD` was the one
 * thing the pane could not do.
 */
export const StatsSection = () => {
  const [stats, setStats] = useState<HistoryStats | null>(null)
  const [reminderStats, setReminderStats] =
    useState<ReminderHistoryStats | null>(null)
  const [sportsStats, setSportsStats] = useState<SportsHistoryStats | null>(
    null,
  )

  useEffect(() => {
    let cancelled = false
    const read = (): void => {
      void window.klokki.getStats().then((next) => {
        if (!cancelled) setStats(next)
      })
      void window.klokki.getReminderStats().then((next) => {
        if (!cancelled) setReminderStats(next)
      })
      void window.klokki.getSportsStats().then((next) => {
        if (!cancelled) setSportsStats(next)
      })
    }

    read()
    const unsubscribe = window.klokki.onHistoryChanged(read)

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  if (!stats || !reminderStats || !sportsStats) return null

  const week = zipWeek(stats, reminderStats, sportsStats)
  const { today } = week

  return (
    <section className="flex flex-1 flex-col gap-4">
      <fieldset
        aria-label={`Today, ${today.date}`}
        className="bg-panel border-line flex flex-col gap-3 rounded-[9px] border p-3.5"
      >
        <legend className="sr-only">Today</legend>
        <div className="flex items-baseline gap-2">
          <span className="text-ink-faint text-[11px] tracking-[0.08em] uppercase">
            Today
          </span>
          <span className="text-ink-ghost text-[11px] tabular-nums">
            {dayLabel(today.date)}
          </span>
          {/* One text node, because it is one thing to read: a count is
              meaningless without the noun it counts. */}
          <span className="text-ink-soft ml-auto text-xs tabular-nums">
            {`${today.completed} ${today.completed === 1 ? 'phase' : 'phases'}`}
          </span>
        </div>

        {today.empty ? (
          <span className="text-ink-hush text-[11px]">Nothing recorded</span>
        ) : (
          <>
            {today.minutes > 0 && (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-[27px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
                    {hoursMinutes(today.minutes)}
                  </span>
                  <span className="text-ink-dim text-xs">tracked</span>
                </div>
                <DayBars day={today} labels={week.labels} />
              </>
            )}

            {/* Reps and kilometres share no scale with minutes, so they are
                counted rather than drawn — next to the minutes, not in a
                section of their own. */}
            {today.counts.length > 0 && (
              <div className="flex flex-wrap gap-x-1.5 gap-y-1">
                {today.counts.map((entry, index) => (
                  <span
                    key={`${entry.label}-${index}`}
                    className="bg-raised text-ink-dim rounded-[5px] px-1.5 py-0.5 text-[10.5px] tabular-nums"
                  >
                    {entry.label}{' '}
                    <span className="text-ink-soft font-semibold">
                      {entry.quantity}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </fieldset>

      <WeekTotals week={week} />

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-3">
          <h2 className="text-ink-faint text-[11px] tracking-[0.08em] uppercase">
            Last 7 days
          </h2>
          {/* Which accent is which label is a fact about the week, so it is
              stated once here rather than inside every row. */}
          <div className="text-ink-faint ml-auto flex flex-wrap justify-end gap-x-3 text-[10.5px]">
            {week.labels.map((label) => (
              <span key={label} className="flex items-center gap-1.5">
                <span
                  className={`size-1.5 rounded-[2px] ${accentFor(week.labels, label)}`}
                />
                {label}
              </span>
            ))}
          </div>
        </div>
        <DaySpine week={week} />
      </div>
    </section>
  )
}
