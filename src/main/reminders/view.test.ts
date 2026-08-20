import { describe, expect, it } from 'vitest'
import type { ReminderDefinition } from '../../shared/reminder'
import type { RemindersState } from './engine'
import { toReminderViews } from './view'

const water: ReminderDefinition = {
  id: 'water',
  name: 'Drink water',
  intervalMinutes: 30,
  steps: [{ label: 'Drink a glass of water' }],
  enabled: true,
}

describe('toReminderViews', () => {
  it('joins a scheduled reminder with its next fire time', () => {
    const state: RemindersState = [
      { definitionId: 'water', nextFireAt: 1_800_000, stepIndex: 0 },
    ]

    expect(toReminderViews([water], state)).toEqual([
      { ...water, nextFireAt: 1_800_000 },
    ])
  })

  it('answers null for a reminder with no running schedule', () => {
    const disabled = { ...water, enabled: false }

    expect(toReminderViews([disabled], [])).toEqual([
      { ...disabled, nextFireAt: null },
    ])
  })
})
