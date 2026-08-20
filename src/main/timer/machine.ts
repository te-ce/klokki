import {
  isRunnable,
  phaseDurationMs,
  type Phase,
  type Preset,
} from '../../shared/preset'

export type TimerState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'running'
      readonly preset: Preset
      readonly phaseIndex: number
      /**
       * The current stretch of the current phase: its start, and when it ends.
       *
       * The end is stored rather than derived from the phase's length because a
       * snooze moves it (see `snooze`), and a phase whose configured length no
       * longer matches its end is the whole point of snoozing.
       */
      readonly phaseStartedAt: number
      readonly phaseEndsAt: number
      /** How much of this stretch was granted by snoozing; 0 for a normal one. */
      readonly snoozedMs: number
    }

export const IDLE: TimerState = { status: 'idle' }

/**
 * Why a phase ended: because its time ran out, or because the user asked for the
 * next one early.
 *
 * The distinction is not cosmetic. A skip must not raise the transition alert —
 * the user just chose the boundary, and an overlay they have to dismiss right
 * after clicking Skip is noise — and history records it as its own outcome,
 * because the stretch is shorter than the phase was configured to be.
 */
export type TransitionCause = 'elapsed' | 'skipped'

/** `next: null` means the preset ran out of phases and the timer went idle. */
export type Transition = {
  readonly completed: Phase
  readonly next: Phase | null
  readonly cause: TransitionCause
  /** Which preset the completed phase belonged to — what history records it under. */
  readonly presetId: string
  /**
   * When the stretch that just ended began. Carried rather than derived from the
   * phase's configured length because a snoozed stretch is shorter than it — the
   * history log records `at - startedAt`, which is the time that actually passed.
   */
  readonly startedAt: number
  readonly at: number
}

export type TickResult = {
  readonly state: TimerState
  readonly transitions: readonly Transition[]
}

/** A boundary the user pushed back rather than let pass. */
export type Snooze = {
  readonly phase: Phase
  /** The boundary that was deferred, not the moment the button was clicked. */
  readonly at: number
  readonly extendedByMs: number
}

export type SnoozeResult = {
  readonly state: TimerState
  /** null when there was nothing to defer, in which case the state is unchanged. */
  readonly snoozed: Snooze | null
}

export const start = (preset: Preset, now: number): TimerState => {
  if (!isRunnable(preset))
    throw new Error(`Preset "${preset.id}" has no runnable phases`)
  return {
    status: 'running',
    preset,
    phaseIndex: 0,
    phaseStartedAt: now,
    phaseEndsAt: now + phaseDurationMs(preset.phases[0]!),
    snoozedMs: 0,
  }
}

export const currentPhase = (state: TimerState): Phase | null =>
  state.status === 'running'
    ? (state.preset.phases[state.phaseIndex] ?? null)
    : null

export const remainingMs = (state: TimerState, now: number): number => {
  if (state.status !== 'running' || !currentPhase(state)) return 0
  return Math.max(0, state.phaseEndsAt - now)
}

/** Where the phase after `index` lives, or null if the preset is over. */
const nextIndex = (preset: Preset, index: number): number | null => {
  const candidate = index + 1
  if (candidate < preset.phases.length) return candidate
  return preset.loop ? 0 : null
}

/** What starts when the current phase ends, or null when nothing will. */
export const nextPhase = (state: TimerState): Phase | null => {
  if (state.status !== 'running' || !currentPhase(state)) return null
  const index = nextIndex(state.preset, state.phaseIndex)
  return index === null ? null : (state.preset.phases[index] ?? null)
}

/** Where the phase before `index` lives — the one whose end started `index`. */
const previousIndex = (preset: Preset, index: number): number | null => {
  if (index > 0) return index - 1
  return preset.loop ? preset.phases.length - 1 : null
}

/**
 * Advances the timer to whichever phase contains `now`.
 *
 * Timing is wall-clock (see AGENTS.md), so after the machine has been asleep for
 * an hour several phases may have elapsed at once — this drains all of them and
 * reports every transition, rather than assuming one tick is one phase. Each
 * phase starts at the previous phase's exact end, so a 1s polling interval
 * cannot accumulate drift.
 */
export const tick = (state: TimerState, now: number): TickResult => {
  const transitions: Transition[] = []
  let current = state

  for (;;) {
    const phase = currentPhase(current)
    if (current.status !== 'running' || !phase)
      return { state: IDLE, transitions }

    const endsAt = current.phaseEndsAt
    if (now < endsAt) return { state: current, transitions }

    const index = nextIndex(current.preset, current.phaseIndex)
    const upcoming =
      index === null ? null : (current.preset.phases[index] ?? null)
    transitions.push({
      completed: phase,
      next: upcoming,
      cause: 'elapsed',
      presetId: current.preset.id,
      startedAt: current.phaseStartedAt,
      at: endsAt,
    })

    if (index === null || !upcoming) return { state: IDLE, transitions }
    current = {
      ...current,
      phaseIndex: index,
      phaseStartedAt: endsAt,
      phaseEndsAt: endsAt + phaseDurationMs(upcoming),
      snoozedMs: 0,
    }
  }
}

/**
 * Ends the current phase now and starts the next one, because the user asked to
 * move on early — standing up before the sitting phase is out.
 *
 * Whatever elapsed on its own is drained first, so a skip cannot swallow a
 * boundary the poll had not yet reported: the phase that ends early is the one
 * the user was actually looking at, and the stretch recorded for it is the time
 * that really passed. The phase that follows gets its full configured length,
 * starting now — the same rule a snoozed boundary follows.
 *
 * Skipping the last phase of a preset that does not loop ends the run, exactly
 * as letting it elapse would.
 */
export const skip = (state: TimerState, now: number): TickResult => {
  const drained = tick(state, now)
  const current = drained.state
  const phase = currentPhase(current)
  if (current.status !== 'running' || !phase) return drained

  const index = nextIndex(current.preset, current.phaseIndex)
  const upcoming =
    index === null ? null : (current.preset.phases[index] ?? null)
  const transitions = [
    ...drained.transitions,
    {
      completed: phase,
      next: upcoming,
      cause: 'skipped' as const,
      presetId: current.preset.id,
      startedAt: current.phaseStartedAt,
      at: now,
    },
  ]

  if (index === null || !upcoming) return { state: IDLE, transitions }

  return {
    state: {
      ...current,
      phaseIndex: index,
      phaseStartedAt: now,
      phaseEndsAt: now + phaseDurationMs(upcoming),
      snoozedMs: 0,
    },
    transitions,
  }
}

/**
 * Defers the boundary the user was just told about, by `extraMs`.
 *
 * By the time the overlay is answered the machine has already moved on, so a
 * snooze goes *back* to the phase that ended and re-ends it `extraMs` after the
 * boundary — not `extraMs` after the click, which would let click latency drift
 * the rest of the sequence. The phase that follows keeps its full length,
 * because its length is applied when it finally starts.
 *
 * Snoozing an already-snoozed stretch extends that stretch instead of stepping
 * back a second phase: two clicks on one overlay must not rewind the timer.
 *
 * Nothing happens when the deferred boundary would land in the past — a snooze
 * only ever moves time forwards.
 */
export const snooze = (
  state: TimerState,
  now: number,
  extraMs: number,
): SnoozeResult => {
  if (state.status !== 'running') return { state, snoozed: null }

  if (state.snoozedMs > 0) {
    const phase = currentPhase(state)
    const endsAt = state.phaseEndsAt + extraMs
    if (!phase || endsAt <= now) return { state, snoozed: null }
    return {
      state: {
        ...state,
        phaseEndsAt: endsAt,
        snoozedMs: state.snoozedMs + extraMs,
      },
      snoozed: { phase, at: state.phaseStartedAt, extendedByMs: extraMs },
    }
  }

  const index = previousIndex(state.preset, state.phaseIndex)
  const phase = index === null ? null : state.preset.phases[index]
  const boundaryAt = state.phaseStartedAt
  if (index === null || !phase || boundaryAt + extraMs <= now)
    return { state, snoozed: null }

  return {
    state: {
      ...state,
      phaseIndex: index,
      phaseStartedAt: boundaryAt,
      phaseEndsAt: boundaryAt + extraMs,
      snoozedMs: extraMs,
    },
    snoozed: { phase, at: boundaryAt, extendedByMs: extraMs },
  }
}
