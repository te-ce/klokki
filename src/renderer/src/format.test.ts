import { describe, expect, it } from 'vitest'
import { dayLabel, hoursMinutes } from './format'

describe('dayLabel', () => {
  it('names the weekday and the day of the month', () => {
    expect(dayLabel('2026-08-19')).toBe('Wed 19')
    expect(dayLabel('2026-08-25')).toBe('Tue 25')
  })

  // The anchor is UTC noon-free: `Date.UTC` and a UTC formatter, so the label
  // cannot slip to the day before west of Greenwich. These two would be the
  // first to say so, being the first day of a month and of a year.
  it('crosses a month and a year boundary', () => {
    expect(dayLabel('2026-09-01')).toBe('Tue 1')
    expect(dayLabel('2027-01-01')).toBe('Fri 1')
  })
})

describe('hoursMinutes', () => {
  it('reads as hours and minutes, never as a clock', () => {
    expect(hoursMinutes(135)).toBe('2h 15m')
    expect(hoursMinutes(45)).toBe('45m')
    expect(hoursMinutes(180)).toBe('3h')
    expect(hoursMinutes(0)).toBe('0m')
  })
})
