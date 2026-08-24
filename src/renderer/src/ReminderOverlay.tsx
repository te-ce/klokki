import { useState } from 'react'
import { MS_PER_MINUTE } from '../../shared/preset'
import {
  REMINDER_SNOOZE_MINUTES_OPTIONS,
  type ReminderAlert,
} from '../../shared/reminder-alert'

/**
 * The whole content of the reminder overlay: one step, and exactly two ways
 * out — Snooze or Done, never a plain dismiss (see issues/open/09). A
 * reminder that hasn't been done should always end in "later" or "done".
 *
 * Done needs a quantity before it is enabled when the step carries a `unit`
 * (e.g. how many pushups); a step with no unit needs no input at all.
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
      className="bg-ground/95 flex h-screen flex-col items-center justify-center gap-5 p-10 text-center"
    >
      <p className="text-[40px] leading-none font-semibold tracking-[-0.02em]">
        {alert.label}
      </p>
      {alert.unit !== null && (
        <input
          type="number"
          placeholder={alert.unit}
          value={quantity}
          autoFocus
          onChange={(event) => setQuantity(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') complete()
          }}
          className="border-edge h-9 w-32 rounded-lg border px-3 text-center"
        />
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {REMINDER_SNOOZE_MINUTES_OPTIONS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            className="border-edge text-ink-soft hover:bg-panel h-9 rounded-lg border px-3 whitespace-nowrap"
            onClick={() =>
              void window.klokki.snoozeReminder(minutes * MS_PER_MINUTE)
            }
          >
            {`Snooze ${minutes} minutes`}
          </button>
        ))}
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
