import { useEffect, useState } from 'react'
import type { HistoryStats } from '../../shared/history'
import type { ReminderHistoryStats } from '../../shared/reminder-history'
import { DayBars } from './DayBars'
import { DayMinutes } from './DayMinutes'
import { ReminderQuantities } from './ReminderQuantities'

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
  const [reminderStats, setReminderStats] =
    useState<ReminderHistoryStats | null>(null)

  useEffect(() => {
    let cancelled = false
    const read = (): void => {
      void window.klokki.getStats().then((next) => {
        if (!cancelled) setStats(next)
      })
      void window.klokki.getReminderStats().then((next) => {
        if (!cancelled) setReminderStats(next)
      })
    }

    read()
    const unsubscribe = window.klokki.onHistoryChanged(read)

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  if (!stats || !reminderStats) return null

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
          <DayBars day={stats.today} />
        )}
      </fieldset>

      <div className="flex flex-col gap-2">
        <h2 className="text-ink-faint text-[11px] tracking-[0.08em] uppercase">
          Last 7 days
        </h2>
        <ul
          aria-label="Last 7 days"
          className="border-line flex flex-col overflow-hidden rounded-[9px] border"
        >
          {stats.days.map((day) => (
            <li
              key={day.date}
              className="border-line flex items-baseline justify-between gap-4 border-b px-3 py-2 text-[11px] last:border-b-0"
            >
              <span className="text-ink-faint tabular-nums">{day.date}</span>
              <DayMinutes day={day} />
            </li>
          ))}
        </ul>
      </div>

      <fieldset
        aria-label={`Reminders today, ${reminderStats.today.date}`}
        className="bg-panel border-line flex flex-col gap-3 rounded-[9px] border p-3.5"
      >
        <legend className="sr-only">Reminders today</legend>
        <span className="text-ink-faint text-[11px] tracking-[0.08em] uppercase">
          Reminders
        </span>
        {reminderStats.today.quantityByLabel.length === 0 ? (
          <span className="text-ink-hush text-[11px]">Nothing recorded</span>
        ) : (
          <ReminderQuantities day={reminderStats.today} />
        )}
      </fieldset>

      <div className="flex flex-col gap-2">
        <h2 className="text-ink-faint text-[11px] tracking-[0.08em] uppercase">
          Reminders, last 7 days
        </h2>
        <ul
          aria-label="Reminders, last 7 days"
          className="border-line flex flex-col overflow-hidden rounded-[9px] border"
        >
          {reminderStats.days.map((day) => (
            <li
              key={day.date}
              className="border-line flex items-baseline justify-between gap-4 border-b px-3 py-2 text-[11px] last:border-b-0"
            >
              <span className="text-ink-faint tabular-nums">{day.date}</span>
              <ReminderQuantities day={day} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
