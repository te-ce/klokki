import { useState } from 'react'
import {
  samePreset,
  validatePreset,
  type Phase,
  type Preset,
} from '../../shared/preset'
import { ChevronRightIcon, PlusIcon, TrashIcon } from './icons'
import { FIELD, PhaseRow } from './PhaseRow'
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
  const at = next[a]
  const bt = next[b]
  if (at === undefined || bt === undefined) return next
  next[a] = bt
  next[b] = at
  return next
}

/** What a row says a preset is, without opening it: the phases and their lengths. */
const summarise = (preset: Preset): string => {
  const phases = preset.phases
    .map((phase) => `${phase.label} ${phase.minutes}`)
    .join(' · ')
  return preset.loop ? `${phases} · loops` : phases
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
  // What the draft looked like when it was opened. Save is only worth offering
  // while the two differ, and a draft typed back into its original shape is not
  // a pending edit — so this is the baseline, not a boolean the edits set.
  const [opened, setOpened] = useState<Preset | null>(null)
  const [problems, setProblems] = useState<readonly string[]>([])

  const dirty = draft !== null && opened !== null && !samePreset(draft, opened)

  const edit = (preset: Preset | null): void => {
    setProblems([])
    setDraft(preset)
    setOpened(preset)
  }

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

    // The draft is what is now on disk, so there is nothing left to save until
    // the user types again.
    setOpened(draft)
    setProblems([])
  }

  const remove = async (): Promise<void> => {
    if (!draft) return
    await window.klokki.deletePreset(draft.id)
    edit(null)
  }

  const editPhases = (phases: readonly Phase[]): void => {
    setDraft((current) => (current ? { ...current, phases } : current))
  }

  return (
    <section className="flex flex-1 flex-col gap-4">
      <div className="flex items-center">
        <h2 className="text-ink-faint text-[11px] tracking-[0.08em] uppercase">
          Presets
        </h2>
        <button
          type="button"
          className="border-edge text-ink-soft hover:bg-panel ml-auto flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs"
          onClick={() => edit(blankPreset())}
        >
          <PlusIcon className="size-3.25" strokeWidth={2} />
          New preset
        </button>
      </div>

      <ul className="border-line flex flex-col overflow-hidden rounded-[9px] border">
        {presets.map((preset) => (
          <li key={preset.id} className="border-line border-b last:border-b-0">
            <button
              type="button"
              aria-label={`Edit ${preset.name}`}
              aria-current={preset.id === draft?.id ? 'true' : undefined}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left ${
                preset.id === draft?.id ? 'bg-line' : 'hover:bg-panel'
              }`}
              onClick={() => edit(preset.id === draft?.id ? null : preset)}
            >
              <span className="font-medium">{preset.name}</span>
              <span className="text-ink-faint min-w-0 truncate text-[11px] tabular-nums">
                {summarise(preset)}
              </span>
              <ChevronRightIcon className="text-ink-hush ml-auto size-3.5 shrink-0" />
            </button>
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
            Preset name
            <input
              className={`${FIELD} text-ink text-[13px]`}
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </label>

          <div className="flex flex-col gap-2">
            <p className="text-ink-faint text-[11px]">
              Phases —{' '}
              <span className="text-ink-hush">
                the label is what the menubar shows
              </span>
            </p>
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
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="border-edge text-ink-dim hover:bg-raised flex h-7 items-center gap-1.5 rounded-md border border-dashed px-2.5 text-xs"
              onClick={() => editPhases([...draft.phases, NEW_PHASE])}
            >
              <PlusIcon className="size-3.25" />
              Add phase
            </button>
            <label className="text-ink-dim flex items-center gap-1.5 text-[11px]">
              <input
                type="checkbox"
                aria-label="Repeat when the last phase ends"
                checked={draft.loop}
                onChange={(event) =>
                  setDraft({ ...draft, loop: event.target.checked })
                }
                className="accent-work size-3.5"
              />
              Repeat when the last phase ends
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
              aria-label="Delete preset"
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
