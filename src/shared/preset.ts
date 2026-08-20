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

export const phaseDurationMs = (phase: Phase): number =>
  phase.minutes * MS_PER_MINUTE

/**
 * A preset with an empty phase list, or a phase of zero length, would make the
 * timer advance forever without time passing. Rejecting it here means the
 * machine can assume progress.
 */
export const isRunnable = (preset: Preset): boolean =>
  preset.phases.length > 0 && preset.phases.every((phase) => phase.minutes > 0)
