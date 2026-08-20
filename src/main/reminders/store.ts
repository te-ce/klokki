import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  isReminderDefinition,
  isRunnableReminder,
  validateReminder,
  type ReminderDefinition,
} from '../../shared/reminder'
import { isRecord, type SaveResult } from '../../shared/preset'

/** Bumped only when the on-disk shape changes; a migration hooks in here. */
export const REMINDERS_SCHEMA_VERSION = 1

const FILE_NAME = 'reminders.json'

const serialise = (reminders: readonly ReminderDefinition[]): string =>
  `${JSON.stringify(
    { schemaVersion: REMINDERS_SCHEMA_VERSION, reminders },
    null,
    2,
  )}\n`

/**
 * The file is hand-editable, so every field is untrusted — same contract as
 * presets.json (`presets/store.ts`). A file that is not a reminder list at all
 * falls back to an empty list; one unrunnable reminder among good ones is
 * dropped rather than failing the whole file.
 */
const decode = (raw: string): readonly ReminderDefinition[] | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.reminders)) return null
  if (!parsed.reminders.every(isReminderDefinition)) return null

  return parsed.reminders.filter(isRunnableReminder)
}

/**
 * Reads the reminders the user actually has, seeding an empty file on first
 * run. Unlike presets there is no seed data — a reminder is opt-in, not a
 * default the app ships with.
 */
export const loadReminders = (dir: string): readonly ReminderDefinition[] => {
  const path = join(dir, FILE_NAME)

  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    try {
      writeFileSync(path, serialise([]), 'utf8')
    } catch {
      /* empty */
    }
    return []
  }

  return decode(raw) ?? []
}

/**
 * The main process's live reminder list — the definitions half of the
 * reminder engine. Mirrors `PresetStore`: everything that reads reminder
 * definitions goes through one of these, so a save is visible everywhere
 * without a relaunch.
 */
export type ReminderStore = {
  readonly list: () => readonly ReminderDefinition[]
  readonly save: (definition: ReminderDefinition) => SaveResult
  readonly remove: (id: string) => void
  readonly setEnabled: (id: string, enabled: boolean) => void
  readonly subscribe: (
    listener: (reminders: readonly ReminderDefinition[]) => void,
  ) => () => void
}

export const createReminderStore = (dir: string): ReminderStore => {
  const path = join(dir, FILE_NAME)
  let reminders = loadReminders(dir)
  const listeners = new Set<
    (reminders: readonly ReminderDefinition[]) => void
  >()

  const commit = (next: readonly ReminderDefinition[]): void => {
    reminders = next
    try {
      writeFileSync(path, serialise(next), 'utf8')
    } catch {
      /* empty */
    }
    for (const listener of listeners) listener(next)
  }

  return {
    list: () => reminders,
    save: (definition) => {
      const problems = validateReminder(definition)
      if (problems.length > 0) return { ok: false, problems }

      const index = reminders.findIndex(
        (candidate) => candidate.id === definition.id,
      )
      commit(
        index === -1
          ? [...reminders, definition]
          : reminders.map((candidate, at) =>
              at === index ? definition : candidate,
            ),
      )
      return { ok: true }
    },
    remove: (id) => {
      const next = reminders.filter((candidate) => candidate.id !== id)
      if (next.length === reminders.length) return
      commit(next)
    },
    setEnabled: (id, enabled) => {
      const index = reminders.findIndex((candidate) => candidate.id === id)
      if (index === -1) return
      commit(
        reminders.map((candidate, at) =>
          at === index ? { ...candidate, enabled } : candidate,
        ),
      )
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
