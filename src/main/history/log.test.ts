import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { HistoryEvent } from '../../shared/history'
import { HISTORY_FILE_NAME, createHistoryLog } from './log'

const dir = (): string => mkdtempSync(join(tmpdir(), 'klokki-history-'))

const event = (overrides: Partial<HistoryEvent> = {}): HistoryEvent => ({
  endedAt: 1_700_000_000_000,
  presetId: 'sit-stand',
  phaseLabel: 'Sitting',
  durationMs: 30 * 60_000,
  outcome: 'completed',
  ...overrides,
})

describe('createHistoryLog', () => {
  it('appends one line per event and reads them back in order', () => {
    const path = dir()
    const log = createHistoryLog(path)

    log.append(event())
    log.append(event({ endedAt: 1_700_000_001_000, phaseLabel: 'Standing' }))

    const raw = readFileSync(join(path, HISTORY_FILE_NAME), 'utf8')
    expect(raw.split('\n').filter(Boolean)).toHaveLength(2)
    expect(log.readRecent().map((entry) => entry.phaseLabel)).toEqual([
      'Sitting',
      'Standing',
    ])
  })

  it('never rewrites what is already on disk', () => {
    const path = dir()
    const first = createHistoryLog(path)
    first.append(event())
    const before = readFileSync(join(path, HISTORY_FILE_NAME), 'utf8')

    // A relaunch: a second log over the same directory.
    const second = createHistoryLog(path)
    second.append(event({ phaseLabel: 'Standing' }))

    const after = readFileSync(join(path, HISTORY_FILE_NAME), 'utf8')
    expect(after.startsWith(before)).toBe(true)
    expect(second.readRecent()).toHaveLength(2)
  })

  it('skips a truncated final line instead of failing', () => {
    const path = dir()
    const log = createHistoryLog(path)
    log.append(event())
    // What a kill mid-write leaves behind: a line with no newline and no closing brace.
    writeFileSync(
      join(path, HISTORY_FILE_NAME),
      `${readFileSync(join(path, HISTORY_FILE_NAME), 'utf8')}{"endedAt":170000`,
      'utf8',
    )

    expect(log.readRecent().map((entry) => entry.phaseLabel)).toEqual([
      'Sitting',
    ])
  })

  it('skips a line that parses but is not an event', () => {
    const path = dir()
    writeFileSync(
      join(path, HISTORY_FILE_NAME),
      `${JSON.stringify({ endedAt: 'yesterday' })}\n${JSON.stringify(event())}\n`,
      'utf8',
    )

    expect(createHistoryLog(path).readRecent()).toEqual([event()])
  })

  it('reads an empty list when there is no log yet', () => {
    expect(createHistoryLog(dir()).readRecent()).toEqual([])
  })

  it('reads only the tail of a long log', () => {
    const path = dir()
    const log = createHistoryLog(path)
    for (let index = 0; index < 500; index += 1)
      log.append(event({ endedAt: 1_700_000_000_000 + index }))

    const tail = log.readRecent(1_024)

    // Bounded by the byte budget, ending at the newest event, and never a
    // half-line spliced out of the middle of the file.
    expect(tail.length).toBeGreaterThan(0)
    expect(tail.length).toBeLessThan(500)
    expect(tail.at(-1)?.endedAt).toBe(1_700_000_000_000 + 499)
  })
})
