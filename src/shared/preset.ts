/**
 * A preset is the only timer primitive: an ordered list of phases, optionally
 * looping. Pomodoro and sit/stand are seed data (see presets.ts), not code paths.
 */

export type Phase = {
  readonly label: string
  readonly minutes: number
  readonly notify: boolean
}

export type Preset = {
  readonly id: string
  readonly name: string
  readonly phases: readonly Phase[]
  readonly loop: boolean
}

export const MS_PER_MINUTE = 60_000

/** What the main process answers when a renderer tries to save a preset. */
export type SaveResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly problems: readonly string[] }

export const phaseDurationMs = (phase: Phase): number =>
  phase.minutes * MS_PER_MINUTE

/**
 * A preset with an empty phase list, or a phase of zero length, would make the
 * timer advance forever without time passing. Rejecting it here means the
 * machine can assume progress.
 */
export const isRunnable = (preset: Preset): boolean =>
  preset.phases.length > 0 && preset.phases.every((phase) => phase.minutes > 0)

/**
 * Why the user cannot save this preset, in the order the form should show it.
 *
 * Validation lives here rather than in the form because the main process owns
 * presets.json: a preset arriving over IPC, or one the user hand-edited, has to
 * meet the same bar as one typed into the editor. `isRunnable` is the subset the
 * machine cares about; this adds what only a human would notice.
 */
export const validatePreset = (preset: Preset): readonly string[] => {
  const problems: string[] = []

  if (preset.name.trim() === '') problems.push('A preset needs a name.')
  if (preset.phases.length === 0)
    problems.push('A preset needs at least one phase.')

  preset.phases.forEach((phase, index) => {
    const which = `Phase ${index + 1}`
    if (phase.label.trim() === '') problems.push(`${which} needs a label.`)
    if (!(phase.minutes > 0))
      problems.push(`${which} needs to be longer than zero minutes.`)
  })

  return problems
}
