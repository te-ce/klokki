import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  isPreset,
  isRecord,
  isRunnable,
  validatePreset,
  type Preset,
  type SaveResult,
} from '../../shared/preset'
import { SEED_PRESETS } from '../../shared/presets'

/** Bumped only when the on-disk shape changes; a migration hooks in here. */
export const PRESETS_SCHEMA_VERSION = 1

const FILE_NAME = 'presets.json'

const serialise = (presets: readonly Preset[]): string =>
  `${JSON.stringify({ schemaVersion: PRESETS_SCHEMA_VERSION, presets }, null, 2)}\n`

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

  const runnable = parsed.presets.filter(isRunnable)
  // A file that legitimately holds no presets — the user deleted them all — is
  // not the same as one whose every entry was a typo. The first is honoured, the
  // second falls back to the seeds, which is why the caller sees [] only here.
  if (parsed.presets.length > 0 && runnable.length === 0) return null

  return runnable
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

  return decode(raw) ?? SEED_PRESETS
}

/**
 * The main process's live preset list. Everything that reads presets — the tray,
 * IPC, the timer — goes through one of these, so a save is visible everywhere
 * without a relaunch.
 */
export type PresetStore = {
  readonly list: () => readonly Preset[]
  /** Upsert by id, keeping an edited preset in its place in the list. */
  readonly save: (preset: Preset) => SaveResult
  readonly remove: (id: string) => void
  readonly subscribe: (
    listener: (presets: readonly Preset[]) => void,
  ) => () => void
}

export const createPresetStore = (dir: string): PresetStore => {
  const path = join(dir, FILE_NAME)
  let presets = loadPresets(dir)
  const listeners = new Set<(presets: readonly Preset[]) => void>()

  const commit = (next: readonly Preset[]): void => {
    presets = next
    // Best-effort, like seeding: the in-memory list is still correct if the disk
    // is not writable, and refusing the edit would be worse than losing it.
    try {
      writeFileSync(path, serialise(next), 'utf8')
    } catch {
      /* empty */
    }
    for (const listener of listeners) listener(next)
  }

  return {
    list: () => presets,
    save: (preset) => {
      // The editor validates too, but this is the boundary that owns the file.
      const problems = validatePreset(preset)
      if (problems.length > 0) return { ok: false, problems }

      const index = presets.findIndex((candidate) => candidate.id === preset.id)
      commit(
        index === -1
          ? [...presets, preset]
          : presets.map((candidate, at) => (at === index ? preset : candidate)),
      )
      return { ok: true }
    },
    remove: (id) => {
      const next = presets.filter((candidate) => candidate.id !== id)
      if (next.length === presets.length) return
      commit(next)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
