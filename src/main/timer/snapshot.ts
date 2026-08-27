import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isPreset, isRecord, type Preset } from '../../shared/preset'
import type { TimerState } from './machine'

/** Bumped only when the on-disk shape changes; a migration hooks in here. */
export const SNAPSHOT_SCHEMA_VERSION = 2

const FILE_NAME = 'timer-state.json'

/** A decoded, but not yet bounds-checked, running state. */
type RunningCandidate = {
  readonly preset: Preset
  readonly phaseIndex: number
  readonly phaseStartedAt: number
  readonly phaseEndsAt: number
  readonly snoozedMs: number
}

/** The same, for a run saved while holding at an unanswered boundary. */
type AwaitingCandidate = {
  readonly preset: Preset
  readonly phaseIndex: number
  readonly completedIndex: number
  readonly boundaryAt: number
}

const isRunningCandidate = (
  state: Record<string, unknown>,
): state is RunningCandidate =>
  state.status === 'running' &&
  isPreset(state.preset) &&
  typeof state.phaseIndex === 'number' &&
  typeof state.phaseStartedAt === 'number' &&
  typeof state.phaseEndsAt === 'number' &&
  typeof state.snoozedMs === 'number'

const isAwaitingCandidate = (
  state: Record<string, unknown>,
): state is AwaitingCandidate =>
  state.status === 'awaiting' &&
  isPreset(state.preset) &&
  typeof state.phaseIndex === 'number' &&
  typeof state.completedIndex === 'number' &&
  typeof state.boundaryAt === 'number'

const indexInRange = (preset: Preset, index: number): boolean =>
  index >= 0 && index < preset.phases.length

/**
 * One saved run. The file is as hand-editable as presets.json, so every field is
 * untrusted: anything that does not decode to a runnable state is dropped rather
 * than replayed, because starting one run short is safe and replaying a bad
 * state is not.
 *
 * A boundary waiting to be answered is saved too: it is a run in progress that
 * happens not to be counting, and losing it on a relaunch would drop the phase
 * the user was about to start.
 */
const decodeRun = (candidate: unknown): TimerState | null => {
  if (!isRecord(candidate)) return null
  const state = candidate

  if (isRunningCandidate(state))
    return indexInRange(state.preset, state.phaseIndex)
      ? { status: 'running', ...state }
      : null

  if (isAwaitingCandidate(state))
    return indexInRange(state.preset, state.phaseIndex) &&
      indexInRange(state.preset, state.completedIndex)
      ? { status: 'awaiting', ...state }
      : null

  return null
}

/**
 * Every run in progress, in the order they were started, so a restart resumes
 * all of them rather than whichever one happened to be saved last.
 *
 * A v1 file held a single `state`, which reads as a one-run list — one line,
 * because a user who left one preset running before an update should find it
 * still running after. A bad run is dropped on its own: one hand-edited entry
 * must not cost the others.
 */
const decode = (raw: string): readonly TimerState[] => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }

  if (!isRecord(parsed)) return []
  const candidates = Array.isArray(parsed.runs) ? parsed.runs : [parsed.state]

  return candidates.flatMap((candidate: unknown) => {
    const state = decodeRun(candidate)
    return state ? [state] : []
  })
}

/**
 * The runs the timer had while any existed, so a restart can resume them instead
 * of losing them. No runs is never written — see `SnapshotStore`.
 */
export type SnapshotStore = {
  readonly save: (states: readonly TimerState[]) => void
  readonly clear: () => void
}

export const createSnapshotStore = (
  dir: string,
): SnapshotStore & { readonly load: () => readonly TimerState[] } => {
  const path = join(dir, FILE_NAME)

  return {
    save: (states) => {
      // Best-effort, like the preset file: an unwritable disk must not take the
      // timer down, and a lost write costs at most a restart's worth of progress.
      try {
        writeFileSync(
          path,
          `${JSON.stringify({ schemaVersion: SNAPSHOT_SCHEMA_VERSION, runs: states })}\n`,
          'utf8',
        )
      } catch {
        /* empty */
      }
    },
    clear: () => {
      try {
        unlinkSync(path)
      } catch {
        /* empty */
      }
    },
    load: () => {
      let raw: string
      try {
        raw = readFileSync(path, 'utf8')
      } catch {
        return []
      }
      return decode(raw)
    },
  }
}
