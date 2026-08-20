import { useState } from 'react'
import {
  sameReminder,
  validateReminder,
  type ReminderDefinition,
  type ReminderStep,
  type ReminderView,
} from '../../shared/reminder'
import { ChevronRightIcon, PlusIcon, TrashIcon } from './icons'
import { FIELD } from './PhaseRow'
import { ReminderStepRow } from './ReminderStepRow'
import { useReminders } from './useReminders'

const NEW_STEP: ReminderStep = { label: '' }

const blankReminder = (): ReminderDefinition => ({
  // The renderer picks the id for the same reason a new preset does: it is the
  // only side that knows a "new reminder" is not an edit of an existing one.
  id: crypto.randomUUID(),
  name: '',
  intervalMinutes: 30,
  steps: [NEW_STEP],
  enabled: true,
})

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

/** What a row says a reminder is, without opening it: its steps in order. */
const summarise = (reminder: ReminderDefinition): string =>
  reminder.steps
    .map((step) => (step.unit ? `${step.label} (${step.unit})` : step.label))
    .join(' · ')

/** "3:45 PM" for a scheduled reminder, or nothing for one that has no next fire. */
const formatNextFire = (nextFireAt: number | null): string =>
  nextFireAt === null
    ? 'Not scheduled'
    : `Next at ${new Date(nextFireAt).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })}`

/**
 * The reminder editor. Its own list and its own create form, independent of
 * presets (see issues/open/10): a reminder has no tray presence and cycles
 * steps rather than counting down a phase list. Shaped exactly like
 * `PresetsSection` — the draft is the only state held here, every mutation goes
 * over the bridge, and the new list arrives back as a push.
 */
export const RemindersSection = () => {
  const reminders = useReminders()
  const [draft, setDraft] = useState<ReminderDefinition | null>(null)
  const [opened, setOpened] = useState<ReminderDefinition | null>(null)
  const [problems, setProblems] = useState<readonly string[]>([])

  const dirty =
    draft !== null && opened !== null && !sameReminder(draft, opened)

  const edit = (reminder: ReminderDefinition | null): void => {
    setProblems([])
    setDraft(reminder)
    setOpened(reminder)
  }

  const submit = async (): Promise<void> => {
    if (!draft) return
    const local = validateReminder(draft)
    if (local.length > 0) {
      setProblems(local)
      return
    }

    const result = await window.klokki.saveReminder(draft)
    if (!result.ok) {
      setProblems(result.problems)
      return
    }

    setOpened(draft)
    setProblems([])
  }

  const remove = async (): Promise<void> => {
    if (!draft) return
    await window.klokki.deleteReminder(draft.id)
    edit(null)
  }

  const editSteps = (steps: readonly ReminderStep[]): void => {
    setDraft((current) => (current ? { ...current, steps } : current))
  }

  return (
    <section className="flex flex-1 flex-col gap-4">
      <div className="flex items-center">
        <h2 className="text-ink-faint text-[11px] tracking-[0.08em] uppercase">
          Reminders
        </h2>
        <button
          type="button"
          className="border-edge text-ink-soft hover:bg-panel ml-auto flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs"
          onClick={() => edit(blankReminder())}
        >
          <PlusIcon className="size-3.25" strokeWidth={2} />
          New reminder
        </button>
      </div>

      <ul className="border-line flex flex-col overflow-hidden rounded-[9px] border">
        {reminders.map((reminder: ReminderView) => (
          <li
            key={reminder.id}
            className="border-line border-b last:border-b-0"
          >
            <div
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left ${
                reminder.id === draft?.id ? 'bg-line' : ''
              }`}
            >
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  aria-label={`Enable ${reminder.name}`}
                  checked={reminder.enabled}
                  onChange={(event) =>
                    void window.klokki.setReminderEnabled(
                      reminder.id,
                      event.target.checked,
                    )
                  }
                  className="accent-work size-3.5"
                />
              </label>
              <button
                type="button"
                aria-label={`Edit ${reminder.name}`}
                aria-current={reminder.id === draft?.id ? 'true' : undefined}
                className="hover:bg-panel flex min-w-0 flex-1 items-center gap-2.5 rounded px-1 py-0.5 text-left"
                onClick={() =>
                  edit(reminder.id === draft?.id ? null : reminder)
                }
              >
                <span className="font-medium">{reminder.name}</span>
                <span className="text-ink-faint min-w-0 truncate text-[11px] tabular-nums">
                  every {reminder.intervalMinutes}m · {summarise(reminder)}
                </span>
                <span className="text-ink-hush ml-auto shrink-0 text-[11px] tabular-nums">
                  {formatNextFire(reminder.nextFireAt)}
                </span>
                <ChevronRightIcon className="text-ink-hush size-3.5 shrink-0" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {draft ? (
        <form
          className="bg-panel border-line flex flex-col gap-3.5 rounded-[9px] border p-3.5"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <label className="text-ink-faint flex flex-col gap-1.5 text-[11px]">
            Reminder name
            <input
              className={`${FIELD} text-ink text-[13px]`}
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <label
              className="text-ink-faint text-[11px]"
              htmlFor="reminder-interval"
            >
              Interval
            </label>
            <div className="flex items-center">
              <input
                id="reminder-interval"
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
            <p className="text-ink-faint text-[11px]">Steps</p>
            <ul className="flex flex-col gap-2">
              {draft.steps.map((step, index) => (
                <ReminderStepRow
                  key={index}
                  step={step}
                  index={index}
                  count={draft.steps.length}
                  onChange={(next) =>
                    editSteps(replaceAt(draft.steps, index, next))
                  }
                  onMove={(to) => editSteps(swap(draft.steps, index, to))}
                  onDelete={() =>
                    editSteps(draft.steps.filter((_, at) => at !== index))
                  }
                />
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="border-edge text-ink-dim hover:bg-raised flex h-7 items-center gap-1.5 rounded-md border border-dashed px-2.5 text-xs"
              onClick={() => editSteps([...draft.steps, NEW_STEP])}
            >
              <PlusIcon className="size-3.25" />
              Add step
            </button>
            <label className="text-ink-dim flex items-center gap-1.5 text-[11px]">
              <input
                type="checkbox"
                aria-label="Enabled"
                checked={draft.enabled}
                onChange={(event) =>
                  setDraft({ ...draft, enabled: event.target.checked })
                }
                className="accent-work size-3.5"
              />
              Enabled
            </label>
          </div>

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

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={!dirty}
              className="bg-ink text-ground flex h-7 items-center rounded-md px-3.5 font-medium disabled:opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              aria-label="Delete reminder"
              className="border-edge text-alarm hover:bg-raised ml-auto flex size-7 items-center justify-center rounded-md border"
              onClick={() => void remove()}
            >
              <TrashIcon className="size-3.5" />
            </button>
          </div>
        </form>
      ) : null}
    </section>
  )
}
