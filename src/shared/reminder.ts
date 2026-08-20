/**
 * A reminder is a second, independent engine from the preset timer — it has no
 * tray title and cycles a list of steps rather than counting down a phase list.
 * See AGENTS.md and issues/open/08 for why it does not reuse the phase machine.
 */

import { isRecord } from './preset'

export type ReminderStep = {
  readonly label: string
  /** Present only when a quantity is meaningful, e.g. "reps". */
  readonly unit?: string
}

export type ReminderDefinition = {
  readonly id: string
  readonly name: string
  readonly intervalMinutes: number
  /** Ordered, cycling: one step fires per interval, then the cursor wraps. */
  readonly steps: readonly ReminderStep[]
  readonly enabled: boolean
}

/**
 * A reminder definition plus when it next fires — null while disabled, or not
 * yet scheduled. This is what the settings window shows and nothing else: the
 * schedule lives in the reminder engine, not in reminders.json, so it is joined
 * on here rather than carried on `ReminderDefinition` itself (see
 * src/main/reminders/view.ts).
 */
export type ReminderView = ReminderDefinition & {
  readonly nextFireAt: number | null
}

export const isReminderStep = (value: unknown): value is ReminderStep =>
  isRecord(value) &&
  typeof value.label === 'string' &&
  (value.unit === undefined || typeof value.unit === 'string')

export const isReminderDefinition = (
  value: unknown,
): value is ReminderDefinition =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.intervalMinutes === 'number' &&
  typeof value.enabled === 'boolean' &&
  Array.isArray(value.steps) &&
  value.steps.every(isReminderStep)

/**
 * A reminder with no steps, or an interval of zero, would fire forever without
 * time passing or have nothing to say when it did. Rejecting it here means the
 * engine can assume progress, the same guarantee `isRunnable` gives presets.
 */
export const isRunnableReminder = (definition: ReminderDefinition): boolean =>
  definition.steps.length > 0 && definition.intervalMinutes > 0

const sameStep = (a: ReminderStep, b: ReminderStep): boolean =>
  a.label === b.label && (a.unit ?? null) === (b.unit ?? null)

/**
 * Whether two reminders are the same reminder, field for field — the reminder
 * counterpart to `samePreset`, and for the same reason: the editor compares its
 * draft against the reminder it opened to decide whether Save is worth offering.
 */
export const sameReminder = (
  a: ReminderDefinition,
  b: ReminderDefinition,
): boolean =>
  a.id === b.id &&
  a.name === b.name &&
  a.intervalMinutes === b.intervalMinutes &&
  a.enabled === b.enabled &&
  a.steps.length === b.steps.length &&
  a.steps.every((step, index) => {
    const other = b.steps[index]
    return other !== undefined && sameStep(step, other)
  })

/** Why the user cannot save this reminder, in the order the form should show it. */
export const validateReminder = (
  definition: ReminderDefinition,
): readonly string[] => {
  const problems: string[] = []

  if (definition.name.trim() === '') problems.push('A reminder needs a name.')
  if (definition.steps.length === 0)
    problems.push('A reminder needs at least one step.')
  if (!(definition.intervalMinutes > 0))
    problems.push('A reminder needs an interval longer than zero minutes.')

  definition.steps.forEach((step, index) => {
    if (step.label.trim() === '')
      problems.push(`Step ${index + 1} needs a label.`)
  })

  return problems
}
