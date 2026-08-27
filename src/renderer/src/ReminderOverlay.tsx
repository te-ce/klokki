import { useState } from 'react'
import {
  REMINDER_SNOOZE_MINUTES_OPTIONS,
  type ReminderAlert,
} from '../../shared/reminder-alert'
import { OverlayStop } from './OverlayStop'
import { SnoozeChoice } from './SnoozeChoice'

/**
 * The whole content of the reminder overlay: one step, and three ways out —
 * Snooze, Done, or Stop, never a plain dismiss (see issues/open/09). A
 * reminder that hasn't been done should always end in "later", "done", or
 * "not any more": closing it with nothing said is the one answer it will not
 * take.
 *
 * Done needs a quantity before it is enabled when the step carries a `unit`
 * (e.g. how many pushups); a step with no unit needs no input at all. The
 * quantity sits in a row named by its unit and the footer is the Sports
 * overlay's footer, because the two windows answer the same question and a
 * user who has learnt one has learnt the other.
 */
export const ReminderOverlay = ({ alert }: { alert: ReminderAlert }) => {
  const [quantity, setQuantity] = useState('')
  const canComplete = alert.unit === null || quantity.trim() !== ''

  const complete = (): void => {
    if (!canComplete) return
    void window.klokki.completeReminder(
      alert.unit === null ? null : Number(quantity),
    )
  }

  return (
    <section
      data-testid="reminder-overlay"
      className="bg-ground/95 flex h-screen flex-col gap-3.5 p-5"
    >
      {/* The one static row in the window — the natural place to grab it and
          drag, since the quantity field and footer below need every click. */}
      <p className="drag-region text-center text-[26px] leading-none font-semibold tracking-[-0.02em]">
        {alert.label}
      </p>
      {alert.unit !== null && (
        <label className="flex h-8 items-center justify-between gap-3 px-0.5">
          <span className="text-ink-soft">{alert.unit}</span>
          <input
            type="number"
            placeholder="0"
            value={quantity}
            autoFocus
            onChange={(event) => setQuantity(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') complete()
            }}
            className="border-edge h-8 w-20 rounded-lg border px-3 text-center"
          />
        </label>
      )}
      <div className="mt-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* Stopping disables this reminder — the tray's stop, reached from
              where the user actually is when they decide it is not for today. */}
          <OverlayStop
            label="Stop reminder"
            onStop={() => void window.klokki.stopReminderFromAlert()}
          />
          <SnoozeChoice
            options={REMINDER_SNOOZE_MINUTES_OPTIONS}
            onSnooze={(extraMs) => void window.klokki.snoozeReminder(extraMs)}
          />
        </div>
        <button
          type="button"
          disabled={!canComplete}
          className="bg-ink text-ground h-9 rounded-lg px-5 font-medium disabled:opacity-40"
          onClick={complete}
        >
          Done
        </button>
      </div>
    </section>
  )
}
