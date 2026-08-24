import { useState } from 'react'
import { MS_PER_MINUTE } from '../../shared/preset'
import {
  SPORTS_SNOOZE_MINUTES_OPTIONS,
  type SportsAlert,
} from '../../shared/sports-alert'

/**
 * The whole content of the Sports overlay: one number input per activity,
 * and exactly two ways out — Snooze or Done, never a plain dismiss, the same
 * shape `ReminderOverlay` gives a single step. An activity left blank is
 * logged as zero rather than skipped: the overlay is a full round, and
 * "didn't do this one" is itself worth a number.
 */
export const SportsOverlay = ({ alert }: { alert: SportsAlert }) => {
  const [quantities, setQuantities] = useState<Record<string, string>>({})

  const complete = (): void => {
    const parsed: Record<string, number> = {}
    for (const activity of alert.activities)
      parsed[activity.id] = Number(quantities[activity.id] ?? 0)
    void window.klokki.confirmSports(parsed)
  }

  return (
    <section
      data-testid="sports-overlay"
      className="bg-ground/95 flex h-screen flex-col items-center justify-center gap-5 p-10 text-center"
    >
      <p className="text-[40px] leading-none font-semibold tracking-[-0.02em]">
        Sports
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {alert.activities.map((activity) => (
          <label
            key={activity.id}
            className="flex flex-col items-center gap-1.5"
          >
            <span>{activity.name}</span>
            <input
              type="number"
              placeholder="0"
              value={quantities[activity.id] ?? ''}
              onChange={(event) =>
                setQuantities({
                  ...quantities,
                  [activity.id]: event.target.value,
                })
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') complete()
              }}
              className="border-edge h-9 w-24 rounded-lg border px-3 text-center"
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {SPORTS_SNOOZE_MINUTES_OPTIONS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            className="border-edge text-ink-soft hover:bg-panel h-9 rounded-lg border px-3 whitespace-nowrap"
            onClick={() =>
              void window.klokki.snoozeSports(minutes * MS_PER_MINUTE)
            }
          >
            {`Snooze ${minutes} minutes`}
          </button>
        ))}
        <button
          type="button"
          className="bg-ink text-ground h-9 rounded-lg px-5 font-medium"
          onClick={complete}
        >
          Done
        </button>
      </div>
    </section>
  )
}
