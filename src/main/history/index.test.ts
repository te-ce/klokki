import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Clock } from '../timer/clock'
import { createHistory, createReminderHistory } from './index'

/** 2026-08-20 12:00 UTC. */
const NOW = Date.UTC(2026, 7, 20, 12, 0)
const clock: Clock = { now: () => NOW }

describe('createHistory', () => {
  it('reads back what it recorded as the stats of the day', () => {
    const dir = mkdtempSync(join(tmpdir(), 'klokki-history-'))
    const history = createHistory(dir, clock, 'UTC')

    history.append({
      endedAt: NOW - 60_000,
      presetId: 'sit-stand',
      phaseLabel: 'Sitting',
      durationMs: 30 * 60_000,
      outcome: 'completed',
    })

    expect(history.stats().today).toEqual({
      date: '2026-08-20',
      completed: 1,
      minutesByLabel: [{ label: 'Sitting', minutes: 30 }],
    })
  })

  it('serves empty stats when nothing has ever been recorded', () => {
    const history = createHistory(
      mkdtempSync(join(tmpdir(), 'klokki-history-')),
      clock,
      'UTC',
    )

    expect(history.stats().days).toHaveLength(7)
    expect(history.stats().today.completed).toBe(0)
  })
})

describe('createReminderHistory', () => {
  it('reads back what it recorded as the stats of the day', () => {
    const dir = mkdtempSync(join(tmpdir(), 'klokki-reminder-history-'))
    const history = createReminderHistory(dir, clock, 'UTC')

    history.append({
      loggedAt: NOW - 60_000,
      reminderId: 'pushups',
      stepLabel: 'Pushups',
      quantity: 20,
      outcome: 'done',
    })

    expect(history.stats().today).toEqual({
      date: '2026-08-20',
      quantityByLabel: [{ label: 'Pushups', quantity: 20 }],
    })
  })

  it('serves empty stats when nothing has ever been recorded', () => {
    const history = createReminderHistory(
      mkdtempSync(join(tmpdir(), 'klokki-reminder-history-')),
      clock,
      'UTC',
    )

    expect(history.stats().days).toHaveLength(7)
    expect(history.stats().today.quantityByLabel).toEqual([])
  })
})
