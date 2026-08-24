import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SportsHistoryEvent } from '../../shared/sports-history'
import { SPORTS_HISTORY_FILE_NAME, createSportsHistoryLog } from './sports-log'

const dir = (): string => mkdtempSync(join(tmpdir(), 'klokki-sports-history-'))

const event = (
  overrides: Partial<SportsHistoryEvent> = {},
): SportsHistoryEvent => ({
  loggedAt: 1_700_000_000_000,
  activityId: 'situps',
  activityLabel: 'Situps',
  quantity: 20,
  ...overrides,
})

describe('createSportsHistoryLog', () => {
  it('appends one line per event and reads them back in order', () => {
    const path = dir()
    const log = createSportsHistoryLog(path)

    log.append(event())
    log.append(event({ loggedAt: 1_700_000_001_000, activityLabel: 'Squats' }))

    const raw = readFileSync(join(path, SPORTS_HISTORY_FILE_NAME), 'utf8')
    expect(raw.split('\n').filter(Boolean)).toHaveLength(2)
    expect(log.readRecent().map((entry) => entry.activityLabel)).toEqual([
      'Situps',
      'Squats',
    ])
  })

  it('never rewrites what is already on disk', () => {
    const path = dir()
    const first = createSportsHistoryLog(path)
    first.append(event())
    const before = readFileSync(join(path, SPORTS_HISTORY_FILE_NAME), 'utf8')

    const second = createSportsHistoryLog(path)
    second.append(event({ activityLabel: 'Squats' }))

    const after = readFileSync(join(path, SPORTS_HISTORY_FILE_NAME), 'utf8')
    expect(after.startsWith(before)).toBe(true)
    expect(second.readRecent()).toHaveLength(2)
  })

  it('skips a truncated final line instead of failing', () => {
    const path = dir()
    const log = createSportsHistoryLog(path)
    log.append(event())
    writeFileSync(
      join(path, SPORTS_HISTORY_FILE_NAME),
      `${readFileSync(join(path, SPORTS_HISTORY_FILE_NAME), 'utf8')}{"loggedAt":170000`,
      'utf8',
    )

    expect(log.readRecent().map((entry) => entry.activityLabel)).toEqual([
      'Situps',
    ])
  })

  it('skips a line that parses but is not an event', () => {
    const path = dir()
    writeFileSync(
      join(path, SPORTS_HISTORY_FILE_NAME),
      `${JSON.stringify({ loggedAt: 'yesterday' })}\n${JSON.stringify(event())}\n`,
      'utf8',
    )

    expect(createSportsHistoryLog(path).readRecent()).toEqual([event()])
  })

  it('reads an empty list when there is no log yet', () => {
    expect(createSportsHistoryLog(dir()).readRecent()).toEqual([])
  })
})
