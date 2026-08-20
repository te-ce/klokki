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
      readonly phaseStartedAt: number
    }

export const IDLE: TimerState = { status: 'idle' }

/** `next: null` means the preset ran out of phases and the timer went idle. */
export type Transition = {
  readonly completed: Phase
  readonly next: Phase | null
  readonly at: number
}

export type TickResult = {
  readonly state: TimerState
  readonly transitions: readonly Transition[]
}

export const start = (preset: Preset, now: number): TimerState => {
  if (!isRunnable(preset))
    throw new Error(`Preset "${preset.id}" has no runnable phases`)
  return { status: 'running', preset, phaseIndex: 0, phaseStartedAt: now }
}

export const currentPhase = (state: TimerState): Phase | null =>
  state.status === 'running'
    ? (state.preset.phases[state.phaseIndex] ?? null)
    : null

export const remainingMs = (state: TimerState, now: number): number => {
  const phase = currentPhase(state)
  if (state.status !== 'running' || !phase) return 0
  return Math.max(0, state.phaseStartedAt + phaseDurationMs(phase) - now)
}

/** Where the phase after `index` lives, or null if the preset is over. */
const nextIndex = (preset: Preset, index: number): number | null => {
  const candidate = index + 1
  if (candidate < preset.phases.length) return candidate
  return preset.loop ? 0 : null
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

    const endsAt = current.phaseStartedAt + phaseDurationMs(phase)
    if (now < endsAt) return { state: current, transitions }

    const index = nextIndex(current.preset, current.phaseIndex)
    const upcoming =
      index === null ? null : (current.preset.phases[index] ?? null)
    transitions.push({ completed: phase, next: upcoming, at: endsAt })

    if (index === null || !upcoming) return { state: IDLE, transitions }
    current = { ...current, phaseIndex: index, phaseStartedAt: endsAt }
  }
}
