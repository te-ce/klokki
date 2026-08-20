import { describe, expect, it } from 'vitest'
import {
  reminderAlertFromRoute,
  reminderAlertRoute,
  type ReminderAlert,
} from './reminder-alert'

const withUnit: ReminderAlert = { label: 'Pushups', unit: 'reps' }
const withoutUnit: ReminderAlert = { label: 'Drink water', unit: null }

describe('reminderAlertRoute and reminderAlertFromRoute', () => {
  it('round-trips a step with a unit', () => {
    expect(reminderAlertFromRoute(reminderAlertRoute(withUnit))).toEqual(
      withUnit,
    )
  })

  it('round-trips a step with no unit', () => {
    expect(reminderAlertFromRoute(reminderAlertRoute(withoutUnit))).toEqual(
      withoutUnit,
    )
  })

  it('reads a route carried in a location hash', () => {
    const hash = `#${reminderAlertRoute(withUnit)}`

    expect(reminderAlertFromRoute(hash)).toEqual(withUnit)
  })

  it('is null for any other route', () => {
    expect(reminderAlertFromRoute('#/settings')).toBeNull()
  })
})
