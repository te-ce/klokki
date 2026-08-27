import { useState } from 'react'
import {
  SPORTS_SNOOZE_MINUTES_OPTIONS,
  type SportsAlert,
} from '../../shared/sports-alert'
import { OverlayStop } from './OverlayStop'
import { SnoozeChoice } from './SnoozeChoice'

/**
 * The whole content of the Sports overlay: one row per activity, and three
 * ways out — Snooze, Done or Stop, never a plain dismiss, the same shape
 * `ReminderOverlay` gives a single step. An activity left blank is logged as
 * zero rather than skipped: the overlay is a full round, and "didn't do this
 * one" is itself worth a number.
 *
 * One activity is one row — name left, field right — rather than a wrapping
 * strip of columns, so the fourth activity costs a row of height the main
 * process can predict (`sportsOverlayHeight`) instead of a second line that
 * only the renderer knows about.
 *
 * The rows are the only part that scrolls. `sportsOverlayHeight` stops growing
 * the window at a share of the screen, and past that the overflow has to go
 * somewhere: it goes to the list, never to the footer, because the footer holds
 * every way out of the alert and an alert with no reachable way out is the worst
 * thing this window can be.
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
      className="bg-ground/95 flex h-screen flex-col gap-3.5 p-5"
    >
      {/* The one static row in the window — the natural place to grab it and
          drag, since every row below is an input and the footer is Snooze/Done. */}
      <p className="drag-region text-center text-[26px] leading-none font-semibold tracking-[-0.02em]">
        Sports
      </p>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        {alert.activities.map((activity) => (
          <label
            key={activity.id}
            className="flex h-8 shrink-0 items-center justify-between gap-3 px-0.5"
          >
            <span className="text-ink-soft">{activity.name}</span>
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
              className="border-edge h-8 w-20 rounded-lg border px-3 text-center"
            />
          </label>
        ))}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div className="flex shrink-0 items-center gap-2">
          {/* Stopping disables the Sports schedule — the tray's stop, offered
              here so the overlay is not the one place it cannot be reached. */}
          <OverlayStop
            label="Stop Sports"
            onStop={() => void window.klokki.stopSportsFromAlert()}
          />
          <SnoozeChoice
            options={SPORTS_SNOOZE_MINUTES_OPTIONS}
            onSnooze={(extraMs) => void window.klokki.snoozeSports(extraMs)}
          />
        </div>
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
