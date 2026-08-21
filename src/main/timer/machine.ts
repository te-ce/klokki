import {
  isRunnable,
  phaseDurationMs,
  type Phase,
  type Preset,
} from '../../shared/preset'

export type TimerState =
  | { readonly status: 'idle' }
  /**
   * A boundary the user has not answered yet: the phase that ended is over, the
   * one that follows is chosen but not started, and no time is passing.
   *
   * A phase list is a sequence of things the user is meant to *do*, so a
   * boundary that starts the next phase on its own hands them a stretch they
   * spent reading the overlay. Holding here instead means the next phase always
   * gets its full length, measured from the moment the user says they are
   * ready — and that a machine asleep for an hour comes back with one boundary
   * to answer rather than twelve phases already spent.
   */
  | {
      readonly status: 'awaiting'
      readonly preset: Preset
      /** The phase that starts once the boundary is confirmed. */
      readonly phaseIndex: number
      /** Which phase ended here — what a snooze extends. */
      readonly completedIndex: number
      /** When it ended. A snooze defers this, never the moment of the click. */
      readonly boundaryAt: number
    }
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
  const firstPhase = preset.phases[0]
  if (!isRunnable(preset) || firstPhase === undefined)
    throw new Error(`Preset "${preset.id}" has no runnable phases`)
  return {
    status: 'running',
    preset,
    phaseIndex: 0,
    phaseStartedAt: now,
    phaseEndsAt: now + phaseDurationMs(firstPhase),
    snoozedMs: 0,
  }
}

/**
 * The phase the run is on: the one counting down, or — while a boundary waits to
 * be answered — the one that is about to. Both are "the phase the user is
 * looking at", which is what every caller here means by it.
 */
export const currentPhase = (state: TimerState): Phase | null =>
  state.status === 'idle'
    ? null
    : (state.preset.phases[state.phaseIndex] ?? null)

/** The phase that ended at an unanswered boundary. */
export const completedPhase = (state: TimerState): Phase | null =>
  state.status === 'awaiting'
    ? (state.preset.phases[state.completedIndex] ?? null)
    : null

export const remainingMs = (state: TimerState, now: number): number => {
  const phase = currentPhase(state)
  if (!phase) return 0
  // An unanswered boundary has a phase but no clock: what is left of it is all
  // of it, which is what a paused countdown should read.
  if (state.status === 'awaiting') return phaseDurationMs(phase)
  if (state.status !== 'running') return 0
  return Math.max(0, state.phaseEndsAt - now)
}

/**
 * How far through the current stretch, from 0 to 1 — what a progress bar draws.
 *
 * Measured against the stretch the machine is actually running, not the phase's
 * configured length: a snoozed stretch is longer than its phase, and a corrected
 * one shorter, and either way the bar should fill up exactly once. Clamped at
 * both ends, so a boundary the poll has not drained yet reads as full rather
 * than as more than full.
 */
export const stretchProgress = (state: TimerState, now: number): number => {
  // A phase that has not started has run none of itself, however long the user
  // takes to answer the boundary before it.
  if (state.status !== 'running' || !currentPhase(state)) return 0
  const length = state.phaseEndsAt - state.phaseStartedAt
  if (length <= 0) return 1
  return Math.min(1, Math.max(0, (now - state.phaseStartedAt) / length))
}

/** Where the phase after `index` lives, or null if the preset is over. */
const nextIndex = (preset: Preset, index: number): number | null => {
  const candidate = index + 1
  if (candidate < preset.phases.length) return candidate
  return preset.loop ? 0 : null
}

/** What starts when the current phase ends, or null when nothing will. */
export const nextPhase = (state: TimerState): Phase | null => {
  if (state.status === 'idle' || !currentPhase(state)) return null
  const index = nextIndex(state.preset, state.phaseIndex)
  return index === null ? null : (state.preset.phases[index] ?? null)
}

/**
 * Advances the timer as far as the clock allows, which is at most one boundary.
 *
 * Timing is wall-clock (see AGENTS.md), so the machine can be asked about a
 * `now` an hour past the phase it was running — but a boundary holds the run
 * until the user answers it, so nothing behind that boundary has elapsed. One
 * tick therefore reports at most one transition, and a machine woken from sleep
 * comes back asking about the phase that ended rather than about the twelve that
 * would have gone by unattended.
 *
 * A run whose last phase ends, and that does not loop, goes idle instead of
 * waiting: there is nothing left to start.
 */
export const tick = (state: TimerState, now: number): TickResult => {
  if (state.status !== 'running') return { state, transitions: [] }

  const phase = currentPhase(state)
  if (!phase) return { state: IDLE, transitions: [] }
  if (now < state.phaseEndsAt) return { state, transitions: [] }

  const endsAt = state.phaseEndsAt
  const index = nextIndex(state.preset, state.phaseIndex)
  const upcoming = index === null ? null : (state.preset.phases[index] ?? null)
  const transitions: readonly Transition[] = [
    {
      completed: phase,
      next: upcoming,
      cause: 'elapsed',
      presetId: state.preset.id,
      startedAt: state.phaseStartedAt,
      at: endsAt,
    },
  ]

  if (index === null || !upcoming) return { state: IDLE, transitions }

  return {
    state: {
      status: 'awaiting',
      preset: state.preset,
      phaseIndex: index,
      completedIndex: state.phaseIndex,
      boundaryAt: endsAt,
    },
    transitions,
  }
}

/**
 * Starts the phase an unanswered boundary is holding, because the user said they
 * are ready.
 *
 * The phase gets its full configured length from `now`, not from the boundary:
 * the point of waiting is that the minutes the user spent getting to the overlay
 * are not minutes of the phase they were promised. Anything but a waiting
 * machine is returned untouched — a confirm arriving after a Stop must not
 * restart the run.
 */
export const confirm = (state: TimerState, now: number): TimerState => {
  if (state.status !== 'awaiting') return state

  const phase = currentPhase(state)
  if (!phase) return IDLE

  return {
    status: 'running',
    preset: state.preset,
    phaseIndex: state.phaseIndex,
    phaseStartedAt: now,
    phaseEndsAt: now + phaseDurationMs(phase),
    snoozedMs: 0,
  }
}

/**
 * Gives the phase that ended `extraMs` more of itself, from the boundary rather
 * than from now — what both a snooze and "+5 min" at an unanswered boundary
 * mean. Null when there is nothing to give it to, or when the extended end has
 * already gone by: time only ever moves forwards.
 */
const deferBoundary = (
  state: TimerState,
  now: number,
  extraMs: number,
): TimerState | null => {
  if (state.status !== 'awaiting') return null

  const phase = completedPhase(state)
  const endsAt = state.boundaryAt + extraMs
  if (!phase || endsAt <= now) return null

  return {
    status: 'running',
    preset: state.preset,
    phaseIndex: state.completedIndex,
    phaseStartedAt: state.boundaryAt,
    phaseEndsAt: endsAt,
    snoozedMs: extraMs,
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
 *
 * At a boundary nobody has answered yet, skipping *is* confirming: the next
 * phase is the one the user is being asked about, and there is no running phase
 * left to cut short.
 */
export const skip = (state: TimerState, now: number): TickResult => {
  const drained = tick(state, now)
  const current = drained.state
  if (current.status === 'awaiting')
    return { state: confirm(current, now), transitions: drained.transitions }

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
 * Corrects the current phase's remaining time to `targetMs` — for a timer
 * started late, to pull it back in sync with the clock on the wall.
 *
 * Whatever elapsed on its own is drained first, so a correction cannot swallow
 * a boundary the poll had not yet reported: the phase whose remaining time
 * changes is the one the user is actually looking at. `targetMs` is clamped to
 * zero rather than rejected — a negative correction just ends the phase on the
 * next tick, the same as any other boundary.
 */
export const setRemaining = (
  state: TimerState,
  now: number,
  targetMs: number,
): TickResult => {
  const drained = tick(state, now)
  const current = drained.state
  if (current.status !== 'running' || !currentPhase(current)) return drained

  return {
    state: { ...current, phaseEndsAt: now + Math.max(0, targetMs) },
    transitions: drained.transitions,
  }
}

/**
 * Adds `extraMs` to the current phase's remaining time — for running long, so
 * the phase does not end mid-task.
 *
 * Whatever elapsed on its own is drained first, so the phase extended is the one
 * the user is actually looking at, the same rule `setRemaining` follows. Unlike
 * `setRemaining` this is relative to wherever the countdown already is, which is
 * what lets the tray offer it with no input to read back.
 *
 * At an unanswered boundary the phase the user is looking at is the one that
 * just ended, so this gives them more of *that* — the same move a snooze makes,
 * without calling itself one.
 */
export const addTime = (
  state: TimerState,
  now: number,
  extraMs: number,
): TickResult => {
  const drained = tick(state, now)
  const current = drained.state
  const deferred = deferBoundary(current, now, extraMs)
  if (deferred) return { state: deferred, transitions: drained.transitions }
  if (current.status !== 'running' || !currentPhase(current)) return drained

  return {
    state: { ...current, phaseEndsAt: current.phaseEndsAt + extraMs },
    transitions: drained.transitions,
  }
}

/**
 * Defers the boundary the user was just told about, by `extraMs`.
 *
 * The boundary is still there to defer — the run is holding at it until it is
 * answered — so a snooze re-ends the phase that finished `extraMs` after the
 * boundary itself, not after the click, which would let the seconds spent
 * reaching the overlay drift the rest of the sequence. The phase that follows
 * keeps its full length, because its length is applied when it finally starts.
 *
 * Snoozing an already-snoozed stretch extends that stretch instead of stepping
 * back a second phase: two clicks on one overlay must not rewind the timer.
 *
 * Nothing happens when the deferred boundary would land in the past — a snooze
 * only ever moves time forwards — and nothing happens when there is no boundary
 * to defer at all.
 */
export const snooze = (
  state: TimerState,
  now: number,
  extraMs: number,
): SnoozeResult => {
  const deferred = deferBoundary(state, now, extraMs)
  if (deferred) {
    const phase = completedPhase(state)
    if (state.status !== 'awaiting' || !phase) return { state, snoozed: null }
    return {
      state: deferred,
      snoozed: { phase, at: state.boundaryAt, extendedByMs: extraMs },
    }
  }

  if (state.status !== 'running' || state.snoozedMs === 0)
    return { state, snoozed: null }

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
