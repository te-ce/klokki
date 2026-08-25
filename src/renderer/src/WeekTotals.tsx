import { hoursMinutes } from './format'
import { STATS_DAYS } from '../../shared/history'
import type { Week } from './week'

/**
 * What the week added up to — the question the pane never answered, because it
 * only ever showed one day at a time next to six more of them.
 *
 * The average is over the whole window, empty days included: a week with two
 * days in it averaged over two days reads as a full week, which is the flattery
 * a stats pane exists to avoid.
 */
export const WeekTotals = ({ week }: { week: Week }) => (
  <dl
    aria-label="Week totals"
    className="border-line bg-panel grid grid-cols-3 gap-px overflow-hidden rounded-[9px] border"
  >
    {[
      { key: 'Week', value: hoursMinutes(week.minutes) },
      {
        key: 'Daily avg',
        value: hoursMinutes(Math.round(week.minutes / STATS_DAYS)),
      },
      {
        key: 'Phases',
        value: `${week.completed}`,
      },
    ].map(({ key, value }) => (
      <div key={key} className="flex flex-col gap-0.5 px-3 py-2.5">
        <dt className="text-ink-faint text-[10px] tracking-[0.07em] uppercase">
          {key}
        </dt>
        <dd className="text-[15px] font-semibold tabular-nums">{value}</dd>
      </div>
    ))}
  </dl>
)
