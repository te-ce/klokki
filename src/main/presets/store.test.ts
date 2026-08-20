import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { isRunnable, type Preset } from '../../shared/preset'
import { SEED_PRESETS } from '../../shared/presets'
import { loadPresets } from './store'

/** Never the real user-data directory: each test owns a throwaway one. */
const testDir = (): string => mkdtempSync(join(tmpdir(), 'klokki-presets-'))

const readRaw = (dir: string): string =>
  readFileSync(join(dir, 'presets.json'), 'utf8')

describe('first launch', () => {
  it('seeds presets.json and returns the seeds', () => {
    const dir = testDir()

    expect(loadPresets(dir)).toEqual(SEED_PRESETS)
    expect(JSON.parse(readRaw(dir))).toEqual({
      schemaVersion: 1,
      presets: SEED_PRESETS,
    })
  })
})

const write = (dir: string, contents: string): void =>
  writeFileSync(join(dir, 'presets.json'), contents, 'utf8')

const stretch: Preset = {
  id: 'stretch',
  name: 'Stretch',
  loop: false,
  phases: [{ label: 'Move', minutes: 2, notify: true }],
}

describe('later launches', () => {
  it('returns the presets on disk, not the seeds', () => {
    const dir = testDir()
    write(dir, JSON.stringify({ schemaVersion: 1, presets: [stretch] }))

    expect(loadPresets(dir)).toEqual([stretch])
  })

  it('leaves a hand-edited file untouched', () => {
    const dir = testDir()
    const contents = JSON.stringify({ schemaVersion: 1, presets: [stretch] })
    write(dir, contents)

    loadPresets(dir)

    expect(readRaw(dir)).toBe(contents)
  })
})

describe('a file the app cannot use', () => {
  it('falls back to the seeds when the JSON is malformed', () => {
    const dir = testDir()
    write(dir, '{ "presets": [')

    expect(loadPresets(dir)).toEqual(SEED_PRESETS)
  })

  it('falls back to the seeds when the shape is wrong', () => {
    const dir = testDir()
    write(dir, JSON.stringify({ schemaVersion: 1, presets: 'pomodoro' }))

    expect(loadPresets(dir)).toEqual(SEED_PRESETS)
  })

  it('does not overwrite a file it failed to parse', () => {
    const dir = testDir()
    write(dir, '{ "presets": [')

    loadPresets(dir)

    expect(readRaw(dir)).toBe('{ "presets": [')
  })
})

describe('presets the machine cannot run', () => {
  it('drops a preset with no phases but keeps the rest', () => {
    const dir = testDir()
    const empty: Preset = {
      id: 'empty',
      name: 'Empty',
      loop: false,
      phases: [],
    }
    write(dir, JSON.stringify({ schemaVersion: 1, presets: [empty, stretch] }))

    expect(loadPresets(dir)).toEqual([stretch])
  })

  it('drops a preset with a zero-minute phase', () => {
    const dir = testDir()
    const instant: Preset = {
      id: 'instant',
      name: 'Instant',
      loop: true,
      phases: [{ label: 'Nothing', minutes: 0, notify: true }],
    }
    write(dir, JSON.stringify({ schemaVersion: 1, presets: [instant] }))

    expect(loadPresets(dir)).toEqual(SEED_PRESETS)
  })

  it('never returns a preset the machine would spin on', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string(),
            name: fc.string(),
            loop: fc.boolean(),
            phases: fc.array(
              fc.record({
                label: fc.string(),
                minutes: fc.integer({ min: -5, max: 5 }),
                notify: fc.boolean(),
              }),
            ),
          }),
        ),
        (presets) => {
          const dir = testDir()
          write(dir, JSON.stringify({ schemaVersion: 1, presets }))

          expect(loadPresets(dir).every(isRunnable)).toBe(true)
        },
      ),
    )
  })
})

describe('a directory it cannot write', () => {
  it('still returns the seeds instead of throwing', () => {
    const dir = testDir()
    chmodSync(dir, 0o500)

    try {
      expect(loadPresets(dir)).toEqual(SEED_PRESETS)
    } finally {
      chmodSync(dir, 0o700)
    }
  })
})
