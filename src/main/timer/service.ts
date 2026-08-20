import type { Preset } from '../../shared/preset'
import { systemClock, type Clock } from './clock'
import { formatRemaining } from './format'
import {
  IDLE,
  currentPhase,
  remainingMs,
  start,
  tick,
  type TimerState,
  type Transition,
} from './machine'

const POLL_INTERVAL_MS = 1_000

/** Everything a view needs to render the timer. Serialisable: it crosses IPC. */
export type TimerView = {
  readonly running: boolean
  readonly presetName: string | null
  readonly phaseLabel: string | null
  readonly remainingMs: number
  readonly countdown: string
}

export type TimerUpdate = {
  readonly view: TimerView
  readonly transitions: readonly Transition[]
}

export type TimerService = {
  readonly startPreset: (preset: Preset) => void
  readonly stop: () => void
  readonly getView: () => TimerView
  readonly subscribe: (listener: (update: TimerUpdate) => void) => () => void
  readonly dispose: () => void
}

const toView = (state: TimerState, now: number): TimerView => {
  const phase = currentPhase(state)
  const remaining = remainingMs(state, now)

  return {
    running: state.status === 'running',
    presetName: state.status === 'running' ? state.preset.name : null,
    phaseLabel: phase?.label ?? null,
    remainingMs: remaining,
    countdown: formatRemaining(remaining),
  }
}

/**
 * The impure shell around the phase machine: owns the poll timer and the current
 * state, and is the only thing here that knows what "now" is. All the logic it
 * drives is pure (machine.ts), which is where the tests live.
 */
export const createTimerService = (
  clock: Clock = systemClock,
): TimerService => {
  let state: TimerState = IDLE
  let poll: ReturnType<typeof setInterval> | null = null
  const listeners = new Set<(update: TimerUpdate) => void>()

  const emit = (transitions: readonly Transition[]): void => {
    const update: TimerUpdate = {
      view: toView(state, clock.now()),
      transitions,
    }
    for (const listener of listeners) listener(update)
  }

  const stopPolling = (): void => {
    if (poll === null) return
    clearInterval(poll)
    poll = null
  }

  const advance = (): void => {
    const result = tick(state, clock.now())
    state = result.state
    if (state.status === 'idle') stopPolling()
    emit(result.transitions)
  }

  return {
    startPreset: (preset) => {
      state = start(preset, clock.now())
      stopPolling()
      poll = setInterval(advance, POLL_INTERVAL_MS)
      emit([])
    },
    stop: () => {
      state = IDLE
      stopPolling()
      emit([])
    },
    getView: () => toView(state, clock.now()),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose: () => {
      stopPolling()
      listeners.clear()
    },
  }
}
