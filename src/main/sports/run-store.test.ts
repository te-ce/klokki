import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STOPPED, type SportRunState } from './engine'
import { createSportRunStore } from './run-store'

const testDir = (): string => mkdtempSync(join(tmpdir(), 'klokki-sport-run-'))

const write = (dir: string, contents: string): void =>
  writeFileSync(join(dir, 'sports-state.json'), contents, 'utf8')

const running: SportRunState = {
  scheduled: true,
  nextFireAt: 1_700_000_000_000,
}

describe('no saved state', () => {
  it('returns the stopped state when there is no file yet', () => {
    expect(createSportRunStore(testDir()).load()).toEqual(STOPPED)
  })
})

describe('a saved state', () => {
  it('round-trips through save and load — surviving a restart', () => {
    const dir = testDir()
    const store = createSportRunStore(dir)

    store.save(running)

    expect(createSportRunStore(dir).load()).toEqual(running)
  })

  it('is removed by clear', () => {
    const dir = testDir()
    const store = createSportRunStore(dir)
    store.save(running)

    store.clear()

    expect(store.load()).toEqual(STOPPED)
  })
})

describe('a file the app cannot use', () => {
  it('returns the stopped state when the JSON is malformed', () => {
    const dir = testDir()
    write(dir, '{ "state": ')

    expect(createSportRunStore(dir).load()).toEqual(STOPPED)
  })

  it('returns the stopped state when the shape is wrong', () => {
    const dir = testDir()
    write(dir, JSON.stringify({ schemaVersion: 1, state: { oops: true } }))

    expect(createSportRunStore(dir).load()).toEqual(STOPPED)
  })
})

describe('a directory it cannot write', () => {
  it('still returns the stopped state from load instead of throwing', () => {
    const dir = testDir()
    chmodSync(dir, 0o500)

    try {
      const store = createSportRunStore(dir)
      expect(() => store.save(running)).not.toThrow()
      expect(store.load()).toEqual(STOPPED)
    } finally {
      chmodSync(dir, 0o700)
    }
  })
})

describe('reading back what was written', () => {
  it('writes a schema version alongside the state', () => {
    const dir = testDir()
    createSportRunStore(dir).save(running)

    expect(
      JSON.parse(readFileSync(join(dir, 'sports-state.json'), 'utf8')),
    ).toEqual({ schemaVersion: 1, state: running })
  })
})
