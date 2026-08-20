import type { ReminderDayStats } from '../../shared/reminder-history'

export const ReminderQuantities = ({ day }: { day: ReminderDayStats }) =>
  day.quantityByLabel.length === 0 ? (
    <span className="text-ink-hush">Nothing recorded</span>
  ) : (
    <span className="flex flex-wrap justify-end gap-x-3">
      {day.quantityByLabel.map((entry) => (
        <span key={entry.label} className="text-ink-dim">
          {entry.label} <span className="tabular-nums">{entry.quantity}</span>
        </span>
      ))}
    </span>
  )
