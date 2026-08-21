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
  /**
   * When the step at `stepIndex` fires — or null while the step *before* it is
   * still waiting to be answered.
   *
   * The next interval does not start on its own: a reminder is a thing the user
   * has to do, and counting the next thirty minutes from a boundary they have
   * not acknowledged would hand them an interval they spent ignoring the
   * overlay. `withConfirmed` is what starts it.
   */
  readonly nextFireAt: number | null
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
 * Fires whichever reminders are due, at most once each: a reminder that fires
 * then waits for its answer, exactly as the phase machine holds at a boundary,
 * so a reminder whose interval passed six times while the app was closed asks
 * once rather than six times.
 *
 * A run whose definition has been deleted or disabled since it was scheduled
 * is dropped rather than fired: it is no longer the caller's to answer for.
 *
 * A run with no `nextFireAt` is waiting to be answered and has no boundary to
 * report.
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

    if (run.nextFireAt === null || run.nextFireAt > now) {
      next.push(run)
      continue
    }

    due.push({
      definitionId: definition.id,
      step: stepAt(definition, run.stepIndex),
      at: run.nextFireAt,
    })
    next.push({
      definitionId: definition.id,
      nextFireAt: null,
      stepIndex: (run.stepIndex + 1) % definition.steps.length,
    })
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

/**
 * Starts the interval after a fired step was answered — the reminder half of the
 * timer's `confirm`. The interval runs from the answer, not from the boundary,
 * because the point of waiting is that the user gets a whole interval back.
 *
 * A run that is not waiting for an answer is left alone: an answer to an overlay
 * that has already been superseded must not move a live schedule.
 */
export const withConfirmed = (
  state: RemindersState,
  definition: ReminderDefinition,
  now: number,
): RemindersState =>
  state.map((run) =>
    run.definitionId === definition.id && run.nextFireAt === null
      ? { ...run, nextFireAt: now + intervalMs(definition) }
      : run,
  )

/** Drops this reminder's schedule — for a delete or a disable. */
export const withRemoved = (
  state: RemindersState,
  definitionId: string,
): RemindersState => state.filter((run) => run.definitionId !== definitionId)

/**
 * Defers the step that just fired, by `extraMs` — it reschedules the same step
 * rather than advancing to the next one, the same distinction the timer's
 * `snooze` draws between deferring a boundary and skipping past it. It is also
 * an answer, so it ends the wait: the deferred step is what fires next.
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
