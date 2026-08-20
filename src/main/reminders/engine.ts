import { MS_PER_MINUTE } from '../../shared/preset'
import type { ReminderDefinition, ReminderStep } from '../../shared/reminder'

/**
 * One enabled reminder's live schedule: which step is next, and when it fires.
 * Carries only the id, not the definition — the engine looks the definition up
 * fresh on every tick, so an edited interval or step list takes effect on the
 * reminder's own next boundary rather than needing a restart.
 */
export type ReminderRunState = {
  readonly definitionId: string
  readonly nextFireAt: number
  readonly stepIndex: number
}

export type RemindersState = readonly ReminderRunState[]

export type ReminderDue = {
  readonly definitionId: string
  readonly step: ReminderStep
  readonly at: number
}

export type ReminderTickResult = {
  readonly state: RemindersState
  readonly due: readonly ReminderDue[]
}

const intervalMs = (definition: ReminderDefinition): number =>
  definition.intervalMinutes * MS_PER_MINUTE

/** A freshly enabled or created reminder's first schedule, one interval out. */
export const scheduleAt = (
  definition: ReminderDefinition,
  now: number,
): ReminderRunState => ({
  definitionId: definition.id,
  nextFireAt: now + intervalMs(definition),
  stepIndex: 0,
})

/** Callers only reach this once `definition.steps.length > 0` is confirmed. */
const stepAt = (
  definition: ReminderDefinition,
  index: number,
): ReminderStep => {
  const step = definition.steps[index % definition.steps.length]
  if (!step)
    throw new Error(`Reminder "${definition.id}" has no step at ${index}`)
  return step
}

/**
 * Drains every boundary that has elapsed for every running reminder, the same
 * way the phase machine's `tick` drains every phase elapsed since the last
 * call — a reminder due for the third time since the app was last open reports
 * all three firings, not one.
 *
 * A run whose definition has been deleted or disabled since it was scheduled
 * is dropped rather than fired: it is no longer the caller's to answer for.
 */
export const tick = (
  state: RemindersState,
  definitions: readonly ReminderDefinition[],
  now: number,
): ReminderTickResult => {
  const due: ReminderDue[] = []
  const next: ReminderRunState[] = []

  for (const run of state) {
    const definition = definitions.find((d) => d.id === run.definitionId)
    if (!definition || !definition.enabled || definition.steps.length === 0)
      continue

    let current = run
    while (current.nextFireAt <= now) {
      due.push({
        definitionId: definition.id,
        step: stepAt(definition, current.stepIndex),
        at: current.nextFireAt,
      })
      current = {
        definitionId: definition.id,
        nextFireAt: current.nextFireAt + intervalMs(definition),
        stepIndex: (current.stepIndex + 1) % definition.steps.length,
      }
    }
    next.push(current)
  }

  return { state: next, due }
}

/** Adds or replaces this reminder's schedule — for a create, an edit, or an enable. */
export const withScheduled = (
  state: RemindersState,
  definition: ReminderDefinition,
  now: number,
): RemindersState => [
  ...state.filter((run) => run.definitionId !== definition.id),
  scheduleAt(definition, now),
]

/** Drops this reminder's schedule — for a delete or a disable. */
export const withRemoved = (
  state: RemindersState,
  definitionId: string,
): RemindersState => state.filter((run) => run.definitionId !== definitionId)

/**
 * Defers the step that just fired, by `extraMs` — it reschedules the same step
 * rather than advancing to the next one, the same distinction the timer's
 * `snooze` draws between deferring a boundary and skipping past it.
 */
export const snooze = (
  state: RemindersState,
  definition: ReminderDefinition,
  now: number,
  extraMs: number,
): RemindersState => {
  const run = state.find((r) => r.definitionId === definition.id)
  if (!run || definition.steps.length === 0) return state

  const stepCount = definition.steps.length
  const previousIndex = (run.stepIndex - 1 + stepCount) % stepCount

  return [
    ...state.filter((r) => r.definitionId !== definition.id),
    {
      definitionId: definition.id,
      nextFireAt: now + extraMs,
      stepIndex: previousIndex,
    },
  ]
}
