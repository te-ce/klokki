import { describe, expect, it } from 'vitest'
import {
  isReminderDefinition,
  validateReminder,
  type ReminderDefinition,
} from './reminder'

const valid: ReminderDefinition = {
  id: 'pushups',
  name: 'Pushups & squats',
  intervalMinutes: 60,
  steps: [
    { label: 'Pushups', unit: 'reps' },
    { label: 'Squats', unit: 'reps' },
  ],
  enabled: true,
}

describe('a reminder the user can save', () => {
  it('reports no problems', () => {
    expect(validateReminder(valid)).toEqual([])
  })

  it('allows a step with no unit', () => {
    expect(
      validateReminder({ ...valid, steps: [{ label: 'Drink water' }] }),
    ).toEqual([])
  })
})

describe('a reminder that could never fire', () => {
  it('rejects an empty step list', () => {
    expect(validateReminder({ ...valid, steps: [] })).toEqual([
      'A reminder needs at least one step.',
    ])
  })

  it('rejects a zero interval', () => {
    expect(validateReminder({ ...valid, intervalMinutes: 0 })).toEqual([
      'A reminder needs an interval longer than zero minutes.',
    ])
  })

  it('rejects a negative interval', () => {
    expect(validateReminder({ ...valid, intervalMinutes: -5 })).toEqual([
      'A reminder needs an interval longer than zero minutes.',
    ])
  })
})

describe('a reminder the user could not tell apart', () => {
  it('rejects a blank name', () => {
    expect(validateReminder({ ...valid, name: '  ' })).toEqual([
      'A reminder needs a name.',
    ])
  })

  it('rejects a blank step label', () => {
    expect(validateReminder({ ...valid, steps: [{ label: '   ' }] })).toEqual([
      'Step 1 needs a label.',
    ])
  })
})

describe('shape checking', () => {
  it('accepts a well-formed definition', () => {
    expect(isReminderDefinition(valid)).toBe(true)
  })

  it('accepts a step with no unit', () => {
    expect(
      isReminderDefinition({ ...valid, steps: [{ label: 'Water' }] }),
    ).toBe(true)
  })

  it('rejects a step whose unit is not a string', () => {
    expect(
      isReminderDefinition({ ...valid, steps: [{ label: 'Water', unit: 3 }] }),
    ).toBe(false)
  })

  it('rejects a non-object', () => {
    expect(isReminderDefinition(null)).toBe(false)
    expect(isReminderDefinition('nope')).toBe(false)
  })

  it('rejects a definition missing a field', () => {
    const { enabled: _enabled, ...rest } = valid
    expect(isReminderDefinition(rest)).toBe(false)
  })
})
