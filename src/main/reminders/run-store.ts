import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isRecord } from '../../shared/preset'
import type { RemindersState, ReminderRunState } from './engine'

/** Bumped only when the on-disk shape changes; a migration hooks in here. */
export const REMINDER_RUN_SCHEMA_VERSION = 1

const FILE_NAME = 'reminders-state.json'

const isReminderRunState = (value: unknown): value is ReminderRunState =>
  isRecord(value) &&
  typeof value.definitionId === 'string' &&
  typeof value.nextFireAt === 'number' &&
  typeof value.stepIndex === 'number'

/**
 * The file is as hand-editable as timer-state.json, so every entry is
 * untrusted. Unlike the timer's single running state, N reminders each have
 * their own schedule — one malformed entry costs only that reminder, the same
 * way one bad preset costs presets.json only that preset.
 */
const decode = (raw: string): RemindersState | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.state)) return null
  return parsed.state.filter(isReminderRunState)
}

/**
 * Each enabled reminder's `nextFireAt` and step cursor, so a reminder due in
 * 90 minutes is still due in 90 minutes after a relaunch — the same guarantee
 * `SnapshotStore` gives the running timer.
 */
export type ReminderRunStore = {
  readonly save: (state: RemindersState) => void
  readonly clear: () => void
  readonly load: () => RemindersState
}

export const createReminderRunStore = (dir: string): ReminderRunStore => {
  const path = join(dir, FILE_NAME)

  return {
    save: (state) => {
      try {
        writeFileSync(
          path,
          `${JSON.stringify(
            { schemaVersion: REMINDER_RUN_SCHEMA_VERSION, state },
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
        return []
      }
      return decode(raw) ?? []
    },
  }
}
