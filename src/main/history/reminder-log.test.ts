import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReminderHistoryEvent } from '../../shared/reminder-history'
import {
  REMINDER_HISTORY_FILE_NAME,
  createReminderHistoryLog,
} from './reminder-log'

const dir = (): string =>
  mkdtempSync(join(tmpdir(), 'klokki-reminder-history-'))

const event = (
  overrides: Partial<ReminderHistoryEvent> = {},
): ReminderHistoryEvent => ({
  loggedAt: 1_700_000_000_000,
  reminderId: 'water',
  stepLabel: 'Drink water',
  quantity: null,
  outcome: 'done',
  ...overrides,
})

describe('createReminderHistoryLog', () => {
  it('appends one line per event and reads them back in order', () => {
    const path = dir()
    const log = createReminderHistoryLog(path)

    log.append(event())
    log.append(event({ loggedAt: 1_700_000_001_000, stepLabel: 'Pushups' }))

    const raw = readFileSync(join(path, REMINDER_HISTORY_FILE_NAME), 'utf8')
    expect(raw.split('\n').filter(Boolean)).toHaveLength(2)
    expect(log.readRecent().map((entry) => entry.stepLabel)).toEqual([
      'Drink water',
      'Pushups',
    ])
  })

  it('reads back a quantity and every outcome a reminder can end with', () => {
    const path = dir()
    const log = createReminderHistoryLog(path)

    log.append(event({ outcome: 'done', quantity: 20 }))
    log.append(event({ outcome: 'snoozed', quantity: null }))

    expect(log.readRecent()).toEqual([
      event({ outcome: 'done', quantity: 20 }),
      event({ outcome: 'snoozed', quantity: null }),
    ])
  })

  it('never rewrites what is already on disk', () => {
    const path = dir()
    const first = createReminderHistoryLog(path)
    first.append(event())
    const before = readFileSync(join(path, REMINDER_HISTORY_FILE_NAME), 'utf8')

    // A relaunch: a second log over the same directory.
    const second = createReminderHistoryLog(path)
    second.append(event({ stepLabel: 'Pushups' }))

    const after = readFileSync(join(path, REMINDER_HISTORY_FILE_NAME), 'utf8')
    expect(after.startsWith(before)).toBe(true)
    expect(second.readRecent()).toHaveLength(2)
  })

  it('skips a truncated final line instead of failing', () => {
    const path = dir()
    const log = createReminderHistoryLog(path)
    log.append(event())
    // What a kill mid-write leaves behind: a line with no newline and no closing brace.
    writeFileSync(
      join(path, REMINDER_HISTORY_FILE_NAME),
      `${readFileSync(join(path, REMINDER_HISTORY_FILE_NAME), 'utf8')}{"loggedAt":170000`,
      'utf8',
    )

    expect(log.readRecent().map((entry) => entry.stepLabel)).toEqual([
      'Drink water',
    ])
  })

  it('skips a line that parses but is not an event', () => {
    const path = dir()
    writeFileSync(
      join(path, REMINDER_HISTORY_FILE_NAME),
      `${JSON.stringify({ loggedAt: 'yesterday' })}\n${JSON.stringify(event())}\n`,
      'utf8',
    )

    expect(createReminderHistoryLog(path).readRecent()).toEqual([event()])
  })

  it('reads an empty list when there is no log yet', () => {
    expect(createReminderHistoryLog(dir()).readRecent()).toEqual([])
  })
})
