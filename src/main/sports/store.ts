import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isRecord, type SaveResult } from '../../shared/preset'
import {
  isSportSettings,
  validateSportSettings,
  type SportSettings,
} from '../../shared/sport'

/** Bumped only when the on-disk shape changes; a migration hooks in here. */
export const SPORTS_SCHEMA_VERSION = 1

const FILE_NAME = 'sports.json'

/**
 * Ships with a routine already filled in — situps, squats, pushups — unlike
 * reminders, which start empty: the request is a default the app already
 * knows, not something opt-in the user has to invent first. Off by default,
 * the same as any other schedule the user hasn't started yet.
 */
export const DEFAULT_SPORTS_SETTINGS: SportSettings = {
  intervalMinutes: 60,
  activities: [
    { id: 'situps', name: 'Situps' },
    { id: 'squats', name: 'Squats' },
    { id: 'pushups', name: 'Pushups' },
  ],
  enabled: false,
}

const serialise = (settings: SportSettings): string =>
  `${JSON.stringify(
    { schemaVersion: SPORTS_SCHEMA_VERSION, settings },
    null,
    2,
  )}\n`

/** The file is hand-editable, so every field is untrusted — same contract as presets.json. */
const decode = (raw: string): SportSettings | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isRecord(parsed) || !isSportSettings(parsed.settings)) return null
  return parsed.settings
}

/** Reads the settings the user actually has, seeding the defaults on first run. */
export const loadSportSettings = (dir: string): SportSettings => {
  const path = join(dir, FILE_NAME)

  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    try {
      writeFileSync(path, serialise(DEFAULT_SPORTS_SETTINGS), 'utf8')
    } catch {
      /* empty */
    }
    return DEFAULT_SPORTS_SETTINGS
  }

  return decode(raw) ?? DEFAULT_SPORTS_SETTINGS
}

/**
 * The main process's live Sports settings — one object, not a CRUD list:
 * there is only ever one Sports schedule. Mirrors `ReminderStore`'s
 * save/subscribe shape.
 */
export type SportStore = {
  readonly get: () => SportSettings
  readonly save: (settings: SportSettings) => SaveResult
  readonly subscribe: (
    listener: (settings: SportSettings) => void,
  ) => () => void
}

export const createSportStore = (dir: string): SportStore => {
  const path = join(dir, FILE_NAME)
  let settings = loadSportSettings(dir)
  const listeners = new Set<(settings: SportSettings) => void>()

  return {
    get: () => settings,
    save: (next) => {
      const problems = validateSportSettings(next)
      if (problems.length > 0) return { ok: false, problems }

      settings = next
      try {
        writeFileSync(path, serialise(next), 'utf8')
      } catch {
        /* empty */
      }
      for (const listener of listeners) listener(next)
      return { ok: true }
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
