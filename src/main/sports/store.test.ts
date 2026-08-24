import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { SportSettings } from '../../shared/sport'
import {
  createSportStore,
  DEFAULT_SPORTS_SETTINGS,
  loadSportSettings,
} from './store'

const testDir = (): string => mkdtempSync(join(tmpdir(), 'klokki-sports-'))

const readRaw = (dir: string): string =>
  readFileSync(join(dir, 'sports.json'), 'utf8')

const write = (dir: string, contents: string): void =>
  writeFileSync(join(dir, 'sports.json'), contents, 'utf8')

const settings: SportSettings = {
  intervalMinutes: 45,
  activities: [{ id: 'lunges', name: 'Lunges' }],
  enabled: true,
}

describe('first launch', () => {
  it('seeds the default routine', () => {
    const dir = testDir()

    expect(loadSportSettings(dir)).toEqual(DEFAULT_SPORTS_SETTINGS)
    expect(JSON.parse(readRaw(dir))).toEqual({
      schemaVersion: 1,
      settings: DEFAULT_SPORTS_SETTINGS,
    })
  })
})

describe('later launches', () => {
  it('returns the settings on disk', () => {
    const dir = testDir()
    write(dir, JSON.stringify({ schemaVersion: 1, settings }))

    expect(loadSportSettings(dir)).toEqual(settings)
  })
})

describe('a file the app cannot use', () => {
  it('falls back to defaults when the JSON is malformed', () => {
    const dir = testDir()
    write(dir, '{ "settings": [')

    expect(loadSportSettings(dir)).toEqual(DEFAULT_SPORTS_SETTINGS)
  })

  it('falls back to defaults when the shape is wrong', () => {
    const dir = testDir()
    write(dir, JSON.stringify({ schemaVersion: 1, settings: 'nope' }))

    expect(loadSportSettings(dir)).toEqual(DEFAULT_SPORTS_SETTINGS)
  })
})

describe('a directory it cannot write', () => {
  it('still returns the defaults instead of throwing', () => {
    const dir = testDir()
    chmodSync(dir, 0o500)

    try {
      expect(loadSportSettings(dir)).toEqual(DEFAULT_SPORTS_SETTINGS)
    } finally {
      chmodSync(dir, 0o700)
    }
  })
})

describe('editing settings', () => {
  it('saves and persists', () => {
    const dir = testDir()
    const store = createSportStore(dir)

    expect(store.save(settings)).toEqual({ ok: true })

    expect(store.get()).toEqual(settings)
    expect(loadSportSettings(dir)).toEqual(settings)
  })
})

describe('settings the editor should not have sent', () => {
  it('is rejected with every reason, and nothing is written', () => {
    const dir = testDir()
    const store = createSportStore(dir)
    const before = readRaw(dir)

    const result = store.save({
      intervalMinutes: 0,
      activities: [],
      enabled: true,
    })

    expect(result).toEqual({
      ok: false,
      problems: [
        'Sports needs at least one activity.',
        'Sports needs an interval longer than zero minutes.',
      ],
    })
    expect(store.get()).toEqual(DEFAULT_SPORTS_SETTINGS)
    expect(readRaw(dir)).toBe(before)
  })
})

describe('watching settings', () => {
  it('tells subscribers the new settings after a save', () => {
    const dir = testDir()
    const store = createSportStore(dir)
    const listener = vi.fn()
    store.subscribe(listener)

    store.save(settings)

    expect(listener).toHaveBeenCalledWith(settings)
  })

  it('stops telling a subscriber that unsubscribed', () => {
    const dir = testDir()
    const store = createSportStore(dir)
    const listener = vi.fn()
    store.subscribe(listener)()

    store.save(settings)

    expect(listener).not.toHaveBeenCalled()
  })
})
