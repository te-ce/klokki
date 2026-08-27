import type { Preset } from '../../shared/preset'
import type { RunView, TimerView } from '../../shared/timer'
import { createPoller } from '../polling'
import { systemClock, type Clock } from './clock'
import { formatRemaining } from './format'
import {
  addTime,
  confirm,
  currentPhase,
  nextPhase,
  remainingMs,
  setRemaining,
  skip,
  snooze,
  start,
  stretchProgress,
  tick,
  type Snooze,
  type TimerState,
  type Transition,
} from './machine'

const POLL_INTERVAL_MS = 1_000

/**
 * A snooze, and the run it happened to.
 *
 * `Snooze` itself names no run — it is the pure machine's answer about one
 * phase — and history has to know which run's stretch it extended, because two
 * runs can each be sitting on a deferred boundary at the same time.
 */
export type RunSnooze = Snooze & { readonly runId: string }

export type TimerUpdate = {
  readonly view: TimerView
  /**
   * Every boundary crossed by this change, across every run. Each carries its
   * own `presetId`, which is the run it belongs to — one poll can drain a
   * boundary in more than one run, so a batch is not one run's news.
   */
  readonly transitions: readonly Transition[]
  /** Set only on the update caused by the user snoozing a boundary. */
  readonly snoozed: RunSnooze | null
}

/**
 * The runs in progress, keyed by the id of the preset each is running.
 *
 * Every command names its run, because there is no such thing as "the" timer
 * any more. An id that is not running is a no-op answering `false`, the same way
 * an unknown preset id is a no-op at the start: a window or a tray menu can name
 * a run that ended under it.
 */
export type TimerService = {
  /**
   * Starts `preset`, or restarts it if it is already running — keyed on
   * `preset.id`, so a preset never has two runs (see AGENTS.md). A restart keeps
   * the run where it was in the order, so the menubar title does not reshuffle.
   */
  readonly startPreset: (preset: Preset) => void
  /** Ends a run. Answers whether there was one to end. */
  readonly stop: (runId: string) => boolean
  /**
   * Defers the boundary a run is holding, by `extraMs`. Answers whether it
   * moved: the run may not exist, there may be no boundary to defer, or the
   * deferred end may already have gone by.
   */
  readonly snooze: (runId: string, extraMs: number) => boolean
  /**
   * Ends a run's current phase now and starts its next. Answers whether anything
   * moved: there is nothing to skip in a run that is not going.
   */
  readonly skip: (runId: string) => boolean
  /**
   * Starts the phase a run's unanswered boundary is holding, because the user
   * said they are ready. Answers whether anything moved: only a waiting run has
   * a boundary to confirm.
   */
  readonly confirm: (runId: string) => boolean
  /**
   * Corrects a run's current phase's remaining time — for a timer started late,
   * to pull it back in sync. Answers whether anything moved.
   */
  readonly setRemaining: (runId: string, targetMs: number) => boolean
  /**
   * Adds `extraMs` to a run's current phase's remaining time. Answers whether
   * anything moved.
   */
  readonly addTime: (runId: string, extraMs: number) => boolean
  readonly getView: () => TimerView
  /**
   * The raw states, in run order, for anything that needs more than the view —
   * e.g. persistence.
   */
  readonly getStates: () => readonly TimerState[]
  /**
   * Restores states loaded from disk. Drains whatever elapsed while the app was
   * closed the same way a poll drains a machine that has been asleep — a run
   * that fully finished is dropped and its transitions still reach history and
   * the alert surface, and one still in progress resumes the poll.
   */
  readonly resume: (loaded: readonly TimerState[]) => void
  readonly subscribe: (listener: (update: TimerUpdate) => void) => () => void
  readonly dispose: () => void
}

/** One run of the view. A state in the collection is running by being there. */
const toRunView = (
  runId: string,
  state: TimerState,
  now: number,
): RunView | null => {
  if (state.status === 'idle') return null
  const remaining = remainingMs(state, now)
  const upcoming = nextPhase(state)

  return {
    runId,
    awaiting: state.status === 'awaiting',
    presetName: state.preset.name,
    phaseLabel: currentPhase(state)?.label ?? null,
    nextPhaseLabel: upcoming?.label ?? null,
    nextPhaseMinutes: upcoming?.minutes ?? null,
    remainingMs: remaining,
    countdown: formatRemaining(remaining),
    // The phase list the run is on, which is not the one in the store once a
    // preset has been edited mid-run. Stripped to what a sequence bar draws.
    phases: state.preset.phases.map(({ label, minutes }) => ({
      label,
      minutes,
    })),
    phaseIndex: currentPhase(state) ? state.phaseIndex : -1,
    loop: state.preset.loop,
    phaseProgress: stretchProgress(state, now),
  }
}

/**
 * The impure shell around the phase machine: owns the poll timer and the runs in
 * progress, and is the only thing here that knows what "now" is.
 *
 * A run is one machine, unforked — the collection is keyed, and every command
 * looks a run up and hands its state to the same pure functions a single run
 * used (machine.ts), which is where the tests live.
 */
export const createTimerService = (
  clock: Clock = systemClock,
): TimerService => {
  // Insertion-ordered, which is the run order the whole app reads: a `set` on a
  // key that is already there leaves it where it was, so restarting a preset
  // does not move it in the menubar title.
  const runs = new Map<string, TimerState>()
  const listeners = new Set<(update: TimerUpdate) => void>()

  /** Every run as a view reads it, at one reading of the clock. */
  const viewNow = (): TimerView => {
    const now = clock.now()
    return {
      runs: [...runs].flatMap(([runId, state]) => {
        const run = toRunView(runId, state, now)
        return run ? [run] : []
      }),
    }
  }

  const emit = (
    transitions: readonly Transition[],
    snoozed: RunSnooze | null = null,
  ): void => {
    const update: TimerUpdate = { view: viewNow(), transitions, snoozed }
    for (const listener of listeners) listener(update)
  }

  /**
   * A run that has landed on idle has finished — it is out of the collection
   * rather than sitting in it as a run with nothing running, which is what makes
   * "in the collection" and "running" the same fact.
   */
  const settle = (runId: string, state: TimerState): void => {
    if (state.status === 'idle') runs.delete(runId)
    else runs.set(runId, state)
  }

  // Only a running phase has a countdown to advance: a run holding at an
  // unanswered boundary sits still, and so does an empty collection. One poll
  // serves every run, and it stops the moment none of them is counting.
  const syncPolling = (): void => {
    const counting = [...runs.values()].some(
      (state) => state.status === 'running',
    )
    if (counting) poller.start()
    else poller.stop()
  }

  const advance = (): void => {
    const now = clock.now()
    const transitions: Transition[] = []
    // Deleting and re-setting keys during this walk is safe, and every run gets
    // the same `now`: two runs whose boundaries fall in one tick must not be
    // drained against two different clock readings.
    for (const [runId, state] of runs) {
      const result = tick(state, now)
      transitions.push(...result.transitions)
      settle(runId, result.state)
    }
    syncPolling()
    emit(transitions)
  }

  const poller = createPoller(POLL_INTERVAL_MS, advance)

  /**
   * The shape every run-scoped command shares: find the run, hand its state to
   * the machine, put the answer back, and say whether anything moved.
   *
   * `null` from `change` is "nothing to do", which is how a command that does not
   * apply to the state the run is in — confirming a run that is counting, or
   * snoozing a boundary already gone by — answers `false` without a special case
   * each.
   */
  const command = (
    runId: string,
    change: (state: TimerState) => {
      readonly state: TimerState
      readonly transitions?: readonly Transition[]
      readonly snoozed?: Snooze | null
    } | null,
  ): boolean => {
    const state = runs.get(runId)
    if (!state) return false
    const result = change(state)
    if (!result) return false
    settle(runId, result.state)
    // A drained boundary can end a non-looping run before the change is even
    // applied, so what to poll is re-decided rather than assumed.
    syncPolling()
    emit(
      result.transitions ?? [],
      result.snoozed ? { ...result.snoozed, runId } : null,
    )
    return true
  }

  return {
    startPreset: (preset) => {
      // Keyed on the preset, so this replaces the run rather than adding a
      // second one — and `Map.set` on a key already there leaves it in place,
      // which is what keeps a restart from reshuffling the menubar title.
      runs.set(preset.id, start(preset, clock.now()))
      syncPolling()
      emit([])
    },
    confirm: (runId) =>
      command(runId, (state) =>
        state.status === 'awaiting'
          ? { state: confirm(state, clock.now()) }
          : null,
      ),
    snooze: (runId, extraMs) =>
      command(runId, (state) => {
        const result = snooze(state, clock.now(), extraMs)
        // Nothing changed when the boundary is gone, so nothing is announced.
        return result.snoozed === null ? null : result
      }),
    skip: (runId) => command(runId, (state) => skip(state, clock.now())),
    setRemaining: (runId, targetMs) =>
      command(runId, (state) =>
        state.status === 'running'
          ? setRemaining(state, clock.now(), targetMs)
          : null,
      ),
    addTime: (runId, extraMs) =>
      command(runId, (state) => addTime(state, clock.now(), extraMs)),
    stop: (runId) => {
      if (!runs.delete(runId)) return false
      syncPolling()
      emit([])
      return true
    },
    resume: (loaded) => {
      const now = clock.now()
      const transitions: Transition[] = []
      for (const state of loaded) {
        if (state.status === 'idle') continue
        const result = tick(state, now)
        transitions.push(...result.transitions)
        settle(state.preset.id, result.state)
      }
      syncPolling()
      emit(transitions)
    },
    getView: viewNow,
    getStates: () => [...runs.values()],
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose: () => {
      poller.stop()
      listeners.clear()
    },
  }
}
