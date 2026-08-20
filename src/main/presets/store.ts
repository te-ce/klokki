import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isRunnable, type Phase, type Preset } from '../../shared/preset'
import { SEED_PRESETS } from '../../shared/presets'

/** Bumped only when the on-disk shape changes; a migration hooks in here. */
export const PRESETS_SCHEMA_VERSION = 1

const FILE_NAME = 'presets.json'

const serialise = (presets: readonly Preset[]): string =>
  `${JSON.stringify({ schemaVersion: PRESETS_SCHEMA_VERSION, presets }, null, 2)}\n`

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isPhase = (value: unknown): value is Phase =>
  isRecord(value) &&
  typeof value.label === 'string' &&
  typeof value.minutes === 'number' &&
  typeof value.notify === 'boolean'

const isPreset = (value: unknown): value is Preset =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.loop === 'boolean' &&
  Array.isArray(value.phases) &&
  value.phases.every(isPhase)

/**
 * The file is hand-editable, so every field is untrusted. A file that is not a
 * preset list at all is a total failure — the caller falls back to the seeds
 * rather than guessing what the user meant. One unrunnable preset among good
 * ones is not: it is dropped, so a single typo costs the user that entry and
 * nothing else. Either way nothing the machine would spin on gets through.
 */
const decode = (raw: string): readonly Preset[] | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.presets)) return null
  if (!parsed.presets.every(isPreset)) return null

  return parsed.presets.filter(isRunnable)
}

/**
 * Reads the presets the user actually has, seeding the file on first run. A
 * menubar timer that refuses to launch over one bad byte is worse than one that
 * falls back to the seeds, so an unusable file is not fatal — and is left on
 * disk untouched, so the user can still fix their own typo.
 *
 * The main process owns this file; the renderer never touches it.
 */
export const loadPresets = (dir: string): readonly Preset[] => {
  const path = join(dir, FILE_NAME)

  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    // First run — or a directory we cannot read. Seeding is best-effort: if the
    // write fails too, the app runs on the seeds in memory rather than not at all.
    try {
      writeFileSync(path, serialise(SEED_PRESETS), 'utf8')
    } catch {
      /* empty */
    }
    return SEED_PRESETS
  }

  const presets = decode(raw)
  // An empty list would leave the tray with nothing to start.
  return presets === null || presets.length === 0 ? SEED_PRESETS : presets
}
