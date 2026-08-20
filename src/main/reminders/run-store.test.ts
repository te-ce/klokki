import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createReminderRunStore } from './run-store'
import type { RemindersState } from './engine'

const testDir = (): string =>
  mkdtempSync(join(tmpdir(), 'klokki-reminder-run-'))

const write = (dir: string, contents: string): void =>
  writeFileSync(join(dir, 'reminders-state.json'), contents, 'utf8')

const running: RemindersState = [
  { definitionId: 'water', nextFireAt: 1_700_000_000_000, stepIndex: 0 },
  { definitionId: 'pushups', nextFireAt: 1_700_000_100_000, stepIndex: 1 },
]

describe('no saved state', () => {
  it('returns an empty list when there is no file yet', () => {
    expect(createReminderRunStore(testDir()).load()).toEqual([])
  })
})

describe('a saved state', () => {
  it('round-trips through save and load — surviving a restart', () => {
    const dir = testDir()
    const store = createReminderRunStore(dir)

    store.save(running)

    expect(createReminderRunStore(dir).load()).toEqual(running)
  })

  it('is removed by clear', () => {
    const dir = testDir()
    const store = createReminderRunStore(dir)
    store.save(running)

    store.clear()

    expect(store.load()).toEqual([])
  })
})

describe('a file the app cannot use', () => {
  it('returns an empty list when the JSON is malformed', () => {
    const dir = testDir()
    write(dir, '{ "state": ')

    expect(createReminderRunStore(dir).load()).toEqual([])
  })

  it('returns an empty list when the shape is wrong', () => {
    const dir = testDir()
    write(dir, JSON.stringify({ schemaVersion: 1, state: { oops: true } }))

    expect(createReminderRunStore(dir).load()).toEqual([])
  })

  it('drops only the malformed run, keeping the rest', () => {
    const dir = testDir()
    write(
      dir,
      JSON.stringify({
        schemaVersion: 1,
        state: [running[0], { definitionId: 'bad', nextFireAt: 'nope' }],
      }),
    )

    expect(createReminderRunStore(dir).load()).toEqual([running[0]])
  })
})

describe('a directory it cannot write', () => {
  it('still returns an empty list from load instead of throwing', () => {
    const dir = testDir()
    chmodSync(dir, 0o500)

    try {
      const store = createReminderRunStore(dir)
      expect(() => store.save(running)).not.toThrow()
      expect(store.load()).toEqual([])
    } finally {
      chmodSync(dir, 0o700)
    }
  })
})

describe('reading back what was written', () => {
  it('writes a schema version alongside the state', () => {
    const dir = testDir()
    createReminderRunStore(dir).save(running)

    expect(
      JSON.parse(readFileSync(join(dir, 'reminders-state.json'), 'utf8')),
    ).toEqual({ schemaVersion: 1, state: running })
  })
})
