import { useState } from 'react'
import { validatePreset, type Phase, type Preset } from '../../shared/preset'
import { usePresets } from './usePresets'

const NEW_PHASE: Phase = { label: '', minutes: 5, notify: true }

const blankPreset = (): Preset => ({
  // The renderer picks the id because it is the only side that knows a "new
  // preset" is not an edit of an existing one; the store upserts by it.
  id: crypto.randomUUID(),
  name: '',
  loop: true,
  phases: [NEW_PHASE],
})

const replaceAt = <T,>(items: readonly T[], index: number, item: T): T[] =>
  items.map((current, at) => (at === index ? item : current))

const swap = <T,>(items: readonly T[], a: number, b: number): T[] => {
  const next = [...items]
  ;[next[a], next[b]] = [next[b]!, next[a]!]
  return next
}

type PhaseRowProps = {
  readonly phase: Phase
  readonly index: number
  readonly count: number
  readonly onChange: (phase: Phase) => void
  readonly onMove: (to: number) => void
  readonly onDelete: () => void
}

const PhaseRow = ({
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
    <li className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={labelId}>
        Phase {index + 1} label
      </label>
      <input
        id={labelId}
        className="min-w-0 flex-1 rounded bg-neutral-800 px-2 py-1 text-sm"
        placeholder="Phase name"
        value={phase.label}
        onChange={(event) => onChange({ ...phase, label: event.target.value })}
      />

      <label className="sr-only" htmlFor={minutesId}>
        Phase {index + 1} minutes
      </label>
      <input
        id={minutesId}
        type="number"
        // No `min`: native constraint validation would block the submit before
        // the shared validation could say which phase is wrong, and in which way.
        className="w-16 rounded bg-neutral-800 px-2 py-1 text-sm tabular-nums"
        value={phase.minutes}
        onChange={(event) =>
          onChange({ ...phase, minutes: Number(event.target.value) })
        }
      />

      <label className="flex items-center gap-1 text-xs text-neutral-400">
        <input
          type="checkbox"
          aria-label={`Notify at the end of ${which}`}
          checked={phase.notify}
          onChange={(event) =>
            onChange({ ...phase, notify: event.target.checked })
          }
        />
        Notify
      </label>

      <button
        type="button"
        aria-label={`Move ${which} up`}
        disabled={index === 0}
        className="rounded bg-neutral-700 px-2 text-sm disabled:opacity-40"
        onClick={() => onMove(index - 1)}
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={`Move ${which} down`}
        disabled={index === count - 1}
        className="rounded bg-neutral-700 px-2 text-sm disabled:opacity-40"
        onClick={() => onMove(index + 1)}
      >
        ↓
      </button>
      <button
        type="button"
        aria-label={`Delete ${which}`}
        className="rounded bg-neutral-700 px-2 text-sm"
        onClick={onDelete}
      >
        ✕
      </button>
    </li>
  )
}

/**
 * The preset editor. It holds the draft being edited and nothing else: the saved
 * list lives in the main process, which owns presets.json, so every mutation goes
 * over the bridge and the new list arrives back as a push (see AGENTS.md) — the
 * same one the tray and the timer panel get, so the three cannot disagree.
 * Editing a preset that is currently running is allowed; the run keeps the phases
 * it started with until it is restarted.
 */
export const PresetsSection = () => {
  const presets = usePresets()
  const [draft, setDraft] = useState<Preset | null>(null)
  const [problems, setProblems] = useState<readonly string[]>([])

  const submit = async (): Promise<void> => {
    if (!draft) return
    // Validated here for the message, and again in the main process because that
    // is the side that owns the file.
    const local = validatePreset(draft)
    if (local.length > 0) {
      setProblems(local)
      return
    }

    const result = await window.klokki.savePreset(draft)
    if (!result.ok) {
      setProblems(result.problems)
      return
    }

    setProblems([])
  }

  const remove = async (): Promise<void> => {
    if (!draft) return
    await window.klokki.deletePreset(draft.id)
    setDraft(null)
    setProblems([])
  }

  const editPhases = (phases: readonly Phase[]): void => {
    setDraft((current) => (current ? { ...current, phases } : current))
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-medium">Presets</h2>
        <button
          type="button"
          className="ml-auto rounded bg-neutral-700 px-3 py-1 text-sm"
          onClick={() => {
            setProblems([])
            setDraft(blankPreset())
          }}
        >
          New preset
        </button>
      </div>

      <ul className="flex flex-col gap-1">
        {presets.map((preset) => (
          <li key={preset.id}>
            <button
              type="button"
              aria-label={`Edit ${preset.name}`}
              className="w-full rounded px-2 py-1 text-left text-sm hover:bg-neutral-800"
              onClick={() => {
                setProblems([])
                setDraft(preset)
              }}
            >
              {preset.name}
            </button>
          </li>
        ))}
      </ul>

      {draft ? (
        <form
          className="flex flex-col gap-3 rounded border border-neutral-700 p-3"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Preset name
            <input
              className="rounded bg-neutral-800 px-2 py-1 text-sm text-neutral-100"
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </label>

          <ul className="flex flex-col gap-2">
            {draft.phases.map((phase, index) => (
              <PhaseRow
                // Phases have no identity of their own, and reordering is by
                // index, so the index is the key.
                key={index}
                phase={phase}
                index={index}
                count={draft.phases.length}
                onChange={(next) =>
                  editPhases(replaceAt(draft.phases, index, next))
                }
                onMove={(to) => editPhases(swap(draft.phases, index, to))}
                onDelete={() =>
                  editPhases(draft.phases.filter((_, at) => at !== index))
                }
              />
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded bg-neutral-700 px-3 py-1 text-sm"
              onClick={() => editPhases([...draft.phases, NEW_PHASE])}
            >
              Add phase
            </button>
            <label className="flex items-center gap-1 text-xs text-neutral-400">
              <input
                type="checkbox"
                aria-label="Repeat when the last phase ends"
                checked={draft.loop}
                onChange={(event) =>
                  setDraft({ ...draft, loop: event.target.checked })
                }
              />
              Repeat
            </label>
          </div>

          {problems.length > 0 ? (
            <ul
              role="alert"
              className="flex flex-col gap-1 text-sm text-red-400"
            >
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}

          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded bg-neutral-200 px-3 py-1 text-sm text-neutral-900"
            >
              Save
            </button>
            <button
              type="button"
              className="rounded bg-neutral-700 px-3 py-1 text-sm"
              onClick={() => void remove()}
            >
              Delete preset
            </button>
          </div>
        </form>
      ) : null}
    </section>
  )
}
