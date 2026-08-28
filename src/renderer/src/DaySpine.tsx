import { dayLabel, hoursMinutes } from './format'
import { accentFor, type Week, type WeekDay } from './week'

/** The counts as one line: they are read, not compared, at this size. */
const countLine = (day: WeekDay): string =>
  day.counts.map((entry) => `${entry.label} ${entry.quantity}`).join(' · ')

/**
 * The week as one ledger, a row per day, newest first.
 *
 * The bar is the day's phase minutes stacked at true proportion and scaled to the
 * busiest day of the week — not to the day's own maximum, which is what the
 * today card does. A row has to be readable against its neighbours here, and a
 * quiet Saturday drawn to its own scale looks exactly like a full Monday.
 *
 * Sports totals sit under the bar on the day they happened, which is the
 * reading the pane could not offer while each log had a list of its own.
 */
export const DaySpine = ({ week }: { week: Week }) => (
  <ul
    aria-label="Last 7 days"
    className="border-line flex flex-col overflow-hidden rounded-[9px] border"
  >
    {week.days.map((day, index) => (
      <li
        key={day.date}
        className={`border-line flex flex-col gap-1 border-b px-3 py-2 last:border-b-0 ${
          index === 0 ? 'bg-panel' : ''
        }`}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={`w-11 shrink-0 text-[11px] tabular-nums ${
              index === 0 ? 'text-ink-soft font-medium' : 'text-ink-faint'
            }`}
          >
            {dayLabel(day.date)}
          </span>

          {day.minutes === 0 ? (
            <span className="bg-track h-1.75 flex-1 rounded-sm" />
          ) : (
            <span className="flex h-1.75 flex-1 gap-0.5">
              {day.minutesByLabel.map((entry) => (
                <span
                  key={entry.label}
                  style={{
                    width: `${(entry.minutes / week.busiest) * 100}%`,
                  }}
                  className={`rounded-sm ${accentFor(week.labels, entry.label)}`}
                />
              ))}
            </span>
          )}

          <span className="text-ink-dim w-13 shrink-0 text-right text-[11px] tabular-nums">
            {day.minutes === 0 ? (
              <span className="text-ink-hush">—</span>
            ) : (
              hoursMinutes(day.minutes)
            )}
          </span>
        </div>

        {/* A day with nothing in any of the three logs says so, rather than
            leaving a bare rule to be read as a rendering fault — and a day with
            minutes but no counts spends no line on saying nothing. */}
        {(day.empty || day.counts.length > 0) && (
          <span className="text-ink-ghost pl-13.5 text-[10px] tabular-nums">
            {day.empty ? 'Nothing recorded' : countLine(day)}
          </span>
        )}
      </li>
    ))}
  </ul>
)
