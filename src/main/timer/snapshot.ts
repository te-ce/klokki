import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isPreset, isRecord, type Preset } from '../../shared/preset'
import type { TimerState } from './machine'

/** Bumped only when the on-disk shape changes; a migration hooks in here. */
export const SNAPSHOT_SCHEMA_VERSION = 1

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
 * The file is as hand-editable as presets.json, so every field is untrusted.
 * Anything that does not decode to a runnable state is treated as no saved run
 * at all — starting idle is always safe, replaying a bad state is not.
 *
 * A boundary waiting to be answered is saved too: it is a run in progress that
 * happens not to be counting, and losing it on a relaunch would drop the phase
 * the user was about to start.
 */
const decode = (raw: string): TimerState | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isRecord(parsed) || !isRecord(parsed.state)) return null
  const { state } = parsed

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
 * The last state the timer was in while a run existed, so a restart can resume
 * it instead of losing it. Idle is never written — see `SnapshotStore`.
 */
export type SnapshotStore = {
  readonly save: (state: TimerState) => void
  readonly clear: () => void
}

export const createSnapshotStore = (
  dir: string,
): SnapshotStore & { readonly load: () => TimerState | null } => {
  const path = join(dir, FILE_NAME)

  return {
    save: (state) => {
      // Best-effort, like the preset file: an unwritable disk must not take the
      // timer down, and a lost write costs at most a restart's worth of progress.
      try {
        writeFileSync(
          path,
          `${JSON.stringify({ schemaVersion: SNAPSHOT_SCHEMA_VERSION, state })}\n`,
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
        return null
      }
      return decode(raw)
    },
  }
}
