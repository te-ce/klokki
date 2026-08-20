import { type Phase } from '../../shared/preset'
import { ChevronDownIcon, ChevronUpIcon, CloseIcon } from './icons'

export const FIELD =
  'bg-rail border-edge focus:border-ink-ghost h-7 rounded-md border px-2.5 outline-none'

export const NUDGE =
  'border-edge text-ink-dim hover:bg-panel flex size-6.5 items-center justify-center rounded-md border disabled:opacity-30'

export type PhaseRowProps = {
  readonly phase: Phase
  readonly index: number
  readonly count: number
  readonly onChange: (phase: Phase) => void
  readonly onMove: (to: number) => void
  readonly onDelete: () => void
}

export const PhaseRow = ({
  phase,
  index,
  count,
  onChange,
  onMove,
  onDelete,
}: PhaseRowProps) => {
  const which = `phase ${index + 1}`
  const labelId = `phase-${index}-label`
  const minutesId = `phase-${index}-minutes`

  return (
    <li className="flex flex-wrap items-center gap-1.5">
      <label className="sr-only" htmlFor={labelId}>
        Phase {index + 1} label
      </label>
      <input
        id={labelId}
        className={`${FIELD} min-w-0 flex-1`}
        placeholder="Phase name"
        value={phase.label}
        onChange={(event) => onChange({ ...phase, label: event.target.value })}
      />

      <label className="sr-only" htmlFor={minutesId}>
        Phase {index + 1} minutes
      </label>
      <div className="flex items-center">
        <input
          id={minutesId}
          type="number"
          // No `min`: native constraint validation would block the submit before
          // the shared validation could say which phase is wrong, and in which way.
          className={`${FIELD} w-13 rounded-r-none border-r-0 tabular-nums`}
          value={phase.minutes}
          onChange={(event) =>
            onChange({ ...phase, minutes: Number(event.target.value) })
          }
        />
        <span className="bg-rail border-edge text-ink-ghost flex h-7 items-center rounded-r-md border border-l-0 pr-2 text-[11px]">
          m
        </span>
      </div>

      <label className="text-ink-dim flex items-center gap-1.5 px-1 text-[11px]">
        <input
          type="checkbox"
          aria-label={`Notify at the end of ${which}`}
          checked={phase.notify}
          onChange={(event) =>
            onChange({ ...phase, notify: event.target.checked })
          }
          className="accent-work size-3.5"
        />
        Notify
      </label>

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
