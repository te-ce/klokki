import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isPreset, isRecord, type Preset } from '../../shared/preset'
import type { TimerState } from './machine'

/** Bumped only when the on-disk shape changes; a migration hooks in here. */
export const SNAPSHOT_SCHEMA_VERSION = 1

const FILE_NAME = 'timer-state.json'

/** A decoded, but not yet bounds-checked, running state. */
type Candidate = {
  readonly preset: Preset
  readonly phaseIndex: number
  readonly phaseStartedAt: number
  readonly phaseEndsAt: number
  readonly snoozedMs: number
}

const isCandidate = (state: Record<string, unknown>): state is Candidate =>
  state.status === 'running' &&
  isPreset(state.preset) &&
  typeof state.phaseIndex === 'number' &&
  typeof state.phaseStartedAt === 'number' &&
  typeof state.phaseEndsAt === 'number' &&
  typeof state.snoozedMs === 'number'

const inRange = (candidate: Candidate): boolean =>
  candidate.phaseIndex >= 0 &&
  candidate.phaseIndex < candidate.preset.phases.length

/**
 * The file is as hand-editable as presets.json, so every field is untrusted.
 * Anything that does not decode to a runnable running state is treated as no
 * saved run at all — starting idle is always safe, replaying a bad state is not.
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
  if (!isCandidate(state) || !inRange(state)) return null

  return { status: 'running', ...state }
}

/**
 * The last state the running timer was in, so a restart can resume it instead
 * of losing it. Only a running state is ever written — see `SnapshotStore`.
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
