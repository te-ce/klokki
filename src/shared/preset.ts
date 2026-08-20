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

/**
 * Whether two presets are the same preset, field for field.
 *
 * Lives here rather than in the editor because it is what "there is something to
 * save" means: the form compares its draft against the preset it opened, and a
 * draft that has been typed back into its original shape is not a pending edit.
 * Compared field by field rather than by stringifying: the draft is rebuilt by
 * spreading, and a preset read back from presets.json carries whatever key order
 * the file had, so a textual compare would call two equal presets different.
 */
const samePhase = (a: Phase, b: Phase): boolean =>
  a.label === b.label && a.minutes === b.minutes && a.notify === b.notify

export const samePreset = (a: Preset, b: Preset): boolean =>
  a.id === b.id &&
  a.name === b.name &&
  a.loop === b.loop &&
  a.phases.length === b.phases.length &&
  a.phases.every((phase, index) => samePhase(phase, b.phases[index]!))

/** What the main process answers when a renderer tries to save a preset. */
export type SaveResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly problems: readonly string[] }

export const phaseDurationMs = (phase: Phase): number =>
  phase.minutes * MS_PER_MINUTE

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const isPhase = (value: unknown): value is Phase =>
  isRecord(value) &&
  typeof value.label === 'string' &&
  typeof value.minutes === 'number' &&
  typeof value.notify === 'boolean'

export const isPreset = (value: unknown): value is Preset =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.loop === 'boolean' &&
  Array.isArray(value.phases) &&
  value.phases.every(isPhase)

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
