import type { SportActivity } from '../../shared/sport'
import { ChevronDownIcon, ChevronUpIcon, CloseIcon } from './icons'
import { FIELD, NUDGE } from './PhaseRow'

export type SportsActivityRowProps = {
  readonly activity: SportActivity
  readonly index: number
  readonly count: number
  readonly onChange: (activity: SportActivity) => void
  readonly onMove: (to: number) => void
  readonly onDelete: () => void
}

/** One editable activity — name only, reorderable and deletable in place. */
export const SportsActivityRow = ({
  activity,
  index,
  count,
  onChange,
  onMove,
  onDelete,
}: SportsActivityRowProps) => {
  const which = `activity ${index + 1}`
  const labelId = `activity-${index}-label`

  return (
    <li className="flex flex-wrap items-center gap-1.5">
      <label className="sr-only" htmlFor={labelId}>
        Activity {index + 1} name
      </label>
      <input
        id={labelId}
        className={`${FIELD} min-w-0 flex-1`}
        placeholder="Activity name"
        value={activity.name}
        onChange={(event) =>
          onChange({ ...activity, name: event.target.value })
        }
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
