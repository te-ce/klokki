import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isRecord } from '../../shared/preset'
import { STOPPED, type SportRunState } from './engine'

/** Bumped only when the on-disk shape changes; a migration hooks in here. */
export const SPORT_RUN_SCHEMA_VERSION = 1

const FILE_NAME = 'sports-state.json'

const isSportRunState = (value: unknown): value is SportRunState =>
  isRecord(value) &&
  typeof value.scheduled === 'boolean' &&
  (typeof value.nextFireAt === 'number' || value.nextFireAt === null)

const decode = (raw: string): SportRunState | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isRecord(parsed) || !isSportRunState(parsed.state)) return null
  return parsed.state
}

/**
 * Sports' `nextFireAt`, so a firing due in 90 minutes is still due in 90
 * minutes after a relaunch — the Sports counterpart to `ReminderRunStore`,
 * for a single schedule instead of an array of them.
 */
export type SportRunStore = {
  readonly save: (state: SportRunState) => void
  readonly clear: () => void
  readonly load: () => SportRunState
}

export const createSportRunStore = (dir: string): SportRunStore => {
  const path = join(dir, FILE_NAME)

  return {
    save: (state) => {
      try {
        writeFileSync(
          path,
          `${JSON.stringify(
            { schemaVersion: SPORT_RUN_SCHEMA_VERSION, state },
            null,
            2,
          )}\n`,
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
        return STOPPED
      }
      return decode(raw) ?? STOPPED
    },
  }
}
