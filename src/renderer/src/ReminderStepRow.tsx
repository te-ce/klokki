import type { ReminderStep } from '../../shared/reminder'
import { ChevronDownIcon, ChevronUpIcon, CloseIcon } from './icons'
import { FIELD, NUDGE } from './PhaseRow'

export type ReminderStepRowProps = {
  readonly step: ReminderStep
  readonly index: number
  readonly count: number
  readonly onChange: (step: ReminderStep) => void
  readonly onMove: (to: number) => void
  readonly onDelete: () => void
}

/** A unit typed back to empty means "no unit", the same as it not being there at all. */
const withUnit = (step: ReminderStep, unit: string): ReminderStep =>
  unit.trim() === '' ? { label: step.label } : { ...step, unit }

export const ReminderStepRow = ({
  step,
  index,
  count,
  onChange,
  onMove,
  onDelete,
}: ReminderStepRowProps) => {
  const which = `step ${index + 1}`
  const labelId = `step-${index}-label`
  const unitId = `step-${index}-unit`

  return (
    <li className="flex flex-wrap items-center gap-1.5">
      <label className="sr-only" htmlFor={labelId}>
        Step {index + 1} label
      </label>
      <input
        id={labelId}
        className={`${FIELD} min-w-0 flex-1`}
        placeholder="Step name"
        value={step.label}
        onChange={(event) => onChange({ ...step, label: event.target.value })}
      />

      <label className="sr-only" htmlFor={unitId}>
        Step {index + 1} unit
      </label>
      <input
        id={unitId}
        className={`${FIELD} w-20`}
        placeholder="Unit (optional)"
        value={step.unit ?? ''}
        onChange={(event) => onChange(withUnit(step, event.target.value))}
      />

      <div className="flex gap-1">
        <button
          type="button"
          aria-label={`Move ${which} up`}
          disabled={index === 0}
          className={NUDGE}
          onClick={() => onMove(index - 1)}
        >
          <ChevronUpIcon className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Move ${which} down`}
          disabled={index === count - 1}
          className={NUDGE}
          onClick={() => onMove(index + 1)}
        >
          <ChevronDownIcon className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Delete ${which}`}
          className={NUDGE}
          onClick={onDelete}
        >
          <CloseIcon className="size-3.5" />
        </button>
      </div>
    </li>
  )
}
