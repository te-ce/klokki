import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Preset } from '../../shared/preset'
import { createSnapshotStore } from './snapshot'

/** Never the real user-data directory: each test owns a throwaway one. */
const testDir = (): string => mkdtempSync(join(tmpdir(), 'klokki-snapshot-'))

const write = (dir: string, contents: string): void =>
  writeFileSync(join(dir, 'timer-state.json'), contents, 'utf8')

const pomodoro: Preset = {
  id: 'pomodoro',
  name: 'Pomodoro',
  loop: false,
  phases: [
    { label: 'Focus', minutes: 25, notify: true },
    { label: 'Break', minutes: 5, notify: true },
  ],
}

const running = {
  status: 'running' as const,
  preset: pomodoro,
  phaseIndex: 0,
  phaseStartedAt: 0,
  phaseEndsAt: 25 * 60_000,
  snoozedMs: 0,
}

describe('no saved run', () => {
  it('returns null when there is no file yet', () => {
    const dir = testDir()

    expect(createSnapshotStore(dir).load()).toBeNull()
  })
})

describe('a saved run', () => {
  it('round-trips through save and load', () => {
    const dir = testDir()
    const store = createSnapshotStore(dir)

    store.save(running)

    expect(store.load()).toEqual(running)
  })

  it('is removed by clear', () => {
    const dir = testDir()
    const store = createSnapshotStore(dir)
    store.save(running)

    store.clear()

    expect(store.load()).toBeNull()
  })

  it('clearing when nothing was saved does not throw', () => {
    const dir = testDir()

    expect(() => createSnapshotStore(dir).clear()).not.toThrow()
  })
})

describe('a file the app cannot use', () => {
  it('returns null when the JSON is malformed', () => {
    const dir = testDir()
    write(dir, '{ "state": ')

    expect(createSnapshotStore(dir).load()).toBeNull()
  })

  it('returns null when the shape is wrong', () => {
    const dir = testDir()
    write(dir, JSON.stringify({ schemaVersion: 1, state: { status: 'idle' } }))

    expect(createSnapshotStore(dir).load()).toBeNull()
  })

  it('returns null when the embedded preset fails validation', () => {
    const dir = testDir()
    write(
      dir,
      JSON.stringify({
        schemaVersion: 1,
        state: { ...running, preset: { ...pomodoro, phases: 'nope' } },
      }),
    )

    expect(createSnapshotStore(dir).load()).toBeNull()
  })

  it('returns null when the saved phase index is out of range', () => {
    const dir = testDir()
    write(
      dir,
      JSON.stringify({
        schemaVersion: 1,
        state: { ...running, phaseIndex: 5 },
      }),
    )

    expect(createSnapshotStore(dir).load()).toBeNull()
  })
})

describe('a directory it cannot write', () => {
  it('still returns null from load instead of throwing', () => {
    const dir = testDir()
    chmodSync(dir, 0o500)

    try {
      const store = createSnapshotStore(dir)
      expect(() => store.save(running)).not.toThrow()
      expect(store.load()).toBeNull()
    } finally {
      chmodSync(dir, 0o700)
    }
  })
})

describe('reading back what was written', () => {
  it('writes a schema version alongside the state', () => {
    const dir = testDir()
    createSnapshotStore(dir).save(running)

    expect(
      JSON.parse(readFileSync(join(dir, 'timer-state.json'), 'utf8')),
    ).toEqual({ schemaVersion: 1, state: running })
  })
})
