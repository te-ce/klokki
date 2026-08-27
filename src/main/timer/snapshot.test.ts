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

const sitStand: Preset = {
  id: 'sit-stand',
  name: 'Sit/Stand',
  loop: true,
  phases: [
    { label: 'Sitting', minutes: 30, notify: true },
    { label: 'Standing', minutes: 15, notify: true },
  ],
}

const secondRun = {
  status: 'awaiting' as const,
  preset: sitStand,
  phaseIndex: 1,
  completedIndex: 0,
  boundaryAt: 30 * 60_000,
}

describe('no saved run', () => {
  it('returns no runs when there is no file yet', () => {
    const dir = testDir()

    expect(createSnapshotStore(dir).load()).toEqual([])
  })
})

describe('a saved run', () => {
  it('round-trips through save and load', () => {
    const dir = testDir()
    const store = createSnapshotStore(dir)

    store.save([running])

    expect(store.load()).toEqual([running])
  })

  // Several presets run at once, so a restart has to bring all of them back —
  // in the order they were started, which is the order the tray title reads.
  it('round-trips every run, in order', () => {
    const dir = testDir()
    const store = createSnapshotStore(dir)

    store.save([running, secondRun])

    expect(store.load()).toEqual([running, secondRun])
  })

  // A file written before concurrent runs existed held one `state`. The user
  // left a preset running; it should still be running after the update.
  it('reads a v1 single-run file as one run', () => {
    const dir = testDir()
    write(dir, JSON.stringify({ schemaVersion: 1, state: running }))

    expect(createSnapshotStore(dir).load()).toEqual([running])
  })

  // One hand-edited entry must not cost the others: starting one run short is
  // safe, and replaying a bad state is not.
  it('drops only the run it cannot decode', () => {
    const dir = testDir()
    write(
      dir,
      JSON.stringify({
        schemaVersion: 2,
        runs: [{ ...running, phaseIndex: 5 }, secondRun],
      }),
    )

    expect(createSnapshotStore(dir).load()).toEqual([secondRun])
  })

  it('is removed by clear', () => {
    const dir = testDir()
    const store = createSnapshotStore(dir)
    store.save([running])

    store.clear()

    expect(store.load()).toEqual([])
  })

  it('clearing when nothing was saved does not throw', () => {
    const dir = testDir()

    expect(() => createSnapshotStore(dir).clear()).not.toThrow()
  })
})

describe('a file the app cannot use', () => {
  it('returns no runs when the JSON is malformed', () => {
    const dir = testDir()
    write(dir, '{ "runs": ')

    expect(createSnapshotStore(dir).load()).toEqual([])
  })

  it('returns no runs when the shape is wrong', () => {
    const dir = testDir()
    write(dir, JSON.stringify({ schemaVersion: 2, runs: [{ status: 'idle' }] }))

    expect(createSnapshotStore(dir).load()).toEqual([])
  })

  it('drops a run whose embedded preset fails validation', () => {
    const dir = testDir()
    write(
      dir,
      JSON.stringify({
        schemaVersion: 2,
        runs: [{ ...running, preset: { ...pomodoro, phases: 'nope' } }],
      }),
    )

    expect(createSnapshotStore(dir).load()).toEqual([])
  })

  it('drops a run whose saved phase index is out of range', () => {
    const dir = testDir()
    write(
      dir,
      JSON.stringify({
        schemaVersion: 2,
        runs: [{ ...running, phaseIndex: 5 }],
      }),
    )

    expect(createSnapshotStore(dir).load()).toEqual([])
  })
})

describe('a directory it cannot write', () => {
  it('still returns no runs from load instead of throwing', () => {
    const dir = testDir()
    chmodSync(dir, 0o500)

    try {
      const store = createSnapshotStore(dir)
      expect(() => store.save([running])).not.toThrow()
      expect(store.load()).toEqual([])
    } finally {
      chmodSync(dir, 0o700)
    }
  })
})

describe('reading back what was written', () => {
  it('writes a schema version alongside the runs', () => {
    const dir = testDir()
    createSnapshotStore(dir).save([running, secondRun])

    expect(
      JSON.parse(readFileSync(join(dir, 'timer-state.json'), 'utf8')),
    ).toEqual({ schemaVersion: 2, runs: [running, secondRun] })
  })
})
