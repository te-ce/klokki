import { useState } from 'react'
import {
  sameSportSettings,
  validateSportSettings,
  type SportActivity,
  type SportSettings,
} from '../../shared/sport'
import { PlusIcon } from './icons'
import { FIELD } from './PhaseRow'
import { SportsActivityRow } from './SportsActivityRow'
import { SportsCountdown } from './SportsCountdown'
import { useSports } from './useSports'

const replaceAt = <T,>(items: readonly T[], index: number, item: T): T[] =>
  items.map((current, at) => (at === index ? item : current))

const swap = <T,>(items: readonly T[], a: number, b: number): T[] => {
  const next = [...items]
  const at = next[a]
  const bt = next[b]
  if (at === undefined || bt === undefined) return next
  next[a] = bt
  next[b] = at
  return next
}

const formatNextFire = (
  awaiting: boolean,
  nextFireAt: number | null,
): string => {
  if (awaiting) return 'Waiting for you'
  if (nextFireAt === null) return 'Not scheduled'
  return `Next at ${new Date(nextFireAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`
}

/**
 * The Sports tab: one schedule, its activities, and a way to log any of them
 * on demand. Shaped like `RemindersSection` but for a single settings object
 * rather than a list — the draft/opened dirty-check is the same idea,
 * compared with `sameSportSettings` instead of `sameReminder`. Starting and
 * stopping bypass the draft entirely: they act on the live schedule, the
 * same as a reminder row's enable checkbox.
 */
export const SportsSection = () => {
  const sports = useSports()
  const [draft, setDraft] = useState<SportSettings | null>(null)
  const [opened, setOpened] = useState<SportSettings | null>(null)
  const [problems, setProblems] = useState<readonly string[]>([])
  const [logged, setLogged] = useState<Record<string, string>>({})

  const dirty =
    draft !== null && opened !== null && !sameSportSettings(draft, opened)

  // Adjusted while rendering rather than in an effect (see the React docs on
  // "adjusting state when a prop changes"): resyncs from a fresh push only
  // while there is nothing unsaved to lose, the same guard the effect this
  // replaced had, without a render this component never needs to commit.
  if (!dirty && (opened === null || !sameSportSettings(opened, sports))) {
    setDraft(sports)
    setOpened(sports)
  }

  if (!draft) return null

  const submit = async (): Promise<void> => {
    const local = validateSportSettings(draft)
    if (local.length > 0) {
      setProblems(local)
      return
    }

    const result = await window.klokki.saveSportsSettings(draft)
    if (!result.ok) {
      setProblems(result.problems)
      return
    }

    setOpened(draft)
    setProblems([])
  }

  const editActivities = (activities: readonly SportActivity[]): void => {
    setDraft((current) => (current ? { ...current, activities } : current))
  }

  const addActivity = (): void =>
    editActivities([...draft.activities, { id: crypto.randomUUID(), name: '' }])

  const logQuantities = async (): Promise<void> => {
    const quantities: Record<string, number> = {}
    for (const activity of sports.activities) {
      const value = logged[activity.id]
      if (value !== undefined && value.trim() !== '')
        quantities[activity.id] = Number(value)
    }
    await window.klokki.logSports(quantities)
    setLogged({})
  }

  return (
    <section className="flex flex-1 flex-col gap-4">
      <div className="flex items-center">
        <h2 className="text-ink-faint text-[11px] tracking-[0.08em] uppercase">
          Sports
        </h2>
        <span className="text-ink-hush ml-auto text-[11px] tabular-nums">
          {formatNextFire(sports.awaiting, sports.nextFireAt)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="bg-ink text-ground flex h-7 items-center rounded-md px-3.5 font-medium"
          onClick={() =>
            void (sports.enabled
              ? window.klokki.stopSports()
              : window.klokki.startSports())
          }
        >
          {sports.enabled ? 'Stop' : 'Start'}
        </button>
      </div>

      {sports.enabled && <SportsCountdown sports={sports} />}

      <form
        className="bg-panel border-line flex flex-col gap-3.5 rounded-[9px] border p-3.5"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label
            className="text-ink-faint text-[11px]"
            htmlFor="sports-interval"
          >
            Interval
          </label>
          <div className="flex items-center">
            <input
              id="sports-interval"
              type="number"
              className={`${FIELD} w-16 rounded-r-none border-r-0 tabular-nums`}
              value={draft.intervalMinutes}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  intervalMinutes: Number(event.target.value),
                })
              }
            />
            <span className="bg-rail border-edge text-ink-ghost flex h-7 items-center rounded-r-md border border-l-0 pr-2 text-[11px]">
              minutes
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-ink-faint text-[11px]">Activities</p>
          <ul className="flex flex-col gap-2">
            {draft.activities.map((activity, index) => (
              <SportsActivityRow
                key={index}
                activity={activity}
                index={index}
                count={draft.activities.length}
                onChange={(next) =>
                  editActivities(replaceAt(draft.activities, index, next))
                }
                onMove={(to) =>
                  editActivities(swap(draft.activities, index, to))
                }
                onDelete={() =>
                  editActivities(
                    draft.activities.filter((_, at) => at !== index),
                  )
                }
              />
            ))}
          </ul>
        </div>

        <button
          type="button"
          className="border-edge text-ink-dim hover:bg-raised flex h-7 items-center gap-1.5 self-start rounded-md border border-dashed px-2.5 text-xs"
          onClick={addActivity}
        >
          <PlusIcon className="size-3.25" />
          Add activity
        </button>

        {problems.length > 0 ? (
          <ul
            role="alert"
            className="text-alarm flex flex-col gap-1 text-[11px]"
          >
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : null}

        <button
          type="submit"
          disabled={!dirty}
          className="bg-ink text-ground flex h-7 items-center self-start rounded-md px-3.5 font-medium disabled:opacity-40"
        >
          Save
        </button>
      </form>

      <div className="flex flex-col gap-2">
        <h2 className="text-ink-faint text-[11px] tracking-[0.08em] uppercase">
          Log now
        </h2>
        <div className="bg-panel border-line flex flex-wrap items-end gap-3 rounded-[9px] border p-3.5">
          {sports.activities.map((activity) => (
            <label
              key={activity.id}
              className="flex flex-col gap-1.5 text-[11px]"
            >
              {activity.name}
              <input
                type="number"
                placeholder="0"
                value={logged[activity.id] ?? ''}
                onChange={(event) =>
                  setLogged({ ...logged, [activity.id]: event.target.value })
                }
                className={`${FIELD} w-20 tabular-nums`}
              />
            </label>
          ))}
          <button
            type="button"
            disabled={sports.activities.length === 0}
            className="bg-ink text-ground flex h-7 items-center rounded-md px-3.5 font-medium disabled:opacity-40"
            onClick={() => void logQuantities()}
          >
            Log
          </button>
        </div>
      </div>
    </section>
  )
}
