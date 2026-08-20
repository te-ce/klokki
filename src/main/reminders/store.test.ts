import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ReminderDefinition } from '../../shared/reminder'
import { createReminderStore, loadReminders } from './store'

const testDir = (): string => mkdtempSync(join(tmpdir(), 'klokki-reminders-'))

const readRaw = (dir: string): string =>
  readFileSync(join(dir, 'reminders.json'), 'utf8')

const write = (dir: string, contents: string): void =>
  writeFileSync(join(dir, 'reminders.json'), contents, 'utf8')

const water: ReminderDefinition = {
  id: 'water',
  name: 'Drink water',
  intervalMinutes: 30,
  steps: [{ label: 'Drink a glass of water' }],
  enabled: true,
}

describe('first launch', () => {
  it('starts with no reminders and seeds an empty file', () => {
    const dir = testDir()

    expect(loadReminders(dir)).toEqual([])
    expect(JSON.parse(readRaw(dir))).toEqual({
      schemaVersion: 1,
      reminders: [],
    })
  })
})

describe('later launches', () => {
  it('returns the reminders on disk', () => {
    const dir = testDir()
    write(dir, JSON.stringify({ schemaVersion: 1, reminders: [water] }))

    expect(loadReminders(dir)).toEqual([water])
  })
})

describe('a file the app cannot use', () => {
  it('falls back to an empty list when the JSON is malformed', () => {
    const dir = testDir()
    write(dir, '{ "reminders": [')

    expect(loadReminders(dir)).toEqual([])
  })

  it('falls back to an empty list when the shape is wrong', () => {
    const dir = testDir()
    write(dir, JSON.stringify({ schemaVersion: 1, reminders: 'water' }))

    expect(loadReminders(dir)).toEqual([])
  })

  it('drops a reminder that could never fire but keeps the rest', () => {
    const dir = testDir()
    const dud: ReminderDefinition = { ...water, id: 'dud', steps: [] }
    write(dir, JSON.stringify({ schemaVersion: 1, reminders: [dud, water] }))

    expect(loadReminders(dir)).toEqual([water])
  })
})

describe('a directory it cannot write', () => {
  it('still returns an empty list instead of throwing', () => {
    const dir = testDir()
    chmodSync(dir, 0o500)

    try {
      expect(loadReminders(dir)).toEqual([])
    } finally {
      chmodSync(dir, 0o700)
    }
  })
})

describe('editing reminders', () => {
  it('adds a reminder and persists it', () => {
    const dir = testDir()
    const store = createReminderStore(dir)

    expect(store.save(water)).toEqual({ ok: true })

    expect(store.list()).toEqual([water])
    expect(loadReminders(dir)).toEqual([water])
  })

  it('replaces a reminder with the same id instead of duplicating it', () => {
    const dir = testDir()
    const store = createReminderStore(dir)
    store.save(water)

    const renamed = { ...water, name: 'Hydrate' }
    store.save(renamed)

    expect(store.list()).toEqual([renamed])
  })

  it('deletes a reminder and persists the deletion', () => {
    const dir = testDir()
    const store = createReminderStore(dir)
    store.save(water)

    store.remove('water')

    expect(store.list()).toEqual([])
    expect(loadReminders(dir)).toEqual([])
  })

  it('flips enabled without touching anything else', () => {
    const dir = testDir()
    const store = createReminderStore(dir)
    store.save(water)

    store.setEnabled('water', false)

    expect(store.list()).toEqual([{ ...water, enabled: false }])
  })

  it('ignores enabling an id it does not have', () => {
    const dir = testDir()
    const store = createReminderStore(dir)

    store.setEnabled('nonexistent', true)

    expect(store.list()).toEqual([])
  })
})

describe('a reminder the editor should not have sent', () => {
  it('is rejected with every reason, and nothing is written', () => {
    const dir = testDir()
    const store = createReminderStore(dir)
    const before = readRaw(dir)

    const result = store.save({
      id: 'bad',
      name: '',
      intervalMinutes: 0,
      steps: [],
      enabled: true,
    })

    expect(result).toEqual({
      ok: false,
      problems: [
        'A reminder needs a name.',
        'A reminder needs at least one step.',
        'A reminder needs an interval longer than zero minutes.',
      ],
    })
    expect(store.list()).toEqual([])
    expect(readRaw(dir)).toBe(before)
  })
})

describe('watching the list', () => {
  it('tells subscribers the new list after a save', () => {
    const dir = testDir()
    const store = createReminderStore(dir)
    const seen: (readonly ReminderDefinition[])[] = []
    store.subscribe((reminders) => {
      ;(seen as ReminderDefinition[][]).push([...reminders])
    })

    store.save(water)

    expect(seen).toEqual([[water]])
  })

  it('tells subscribers on enable', () => {
    const dir = testDir()
    const store = createReminderStore(dir)
    store.save(water)
    const listener = vi.fn()
    store.subscribe(listener)

    store.setEnabled('water', false)

    expect(listener).toHaveBeenCalledWith([{ ...water, enabled: false }])
  })

  it('stops telling a subscriber that unsubscribed', () => {
    const dir = testDir()
    const store = createReminderStore(dir)
    const listener = vi.fn()
    store.subscribe(listener)()

    store.save(water)

    expect(listener).not.toHaveBeenCalled()
  })
})
