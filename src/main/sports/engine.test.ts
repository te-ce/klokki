import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { MS_PER_MINUTE } from '../../shared/preset'
import type { SportSettings } from '../../shared/sport'
import {
  addTime,
  scheduleAt,
  setRemaining,
  snooze,
  STOPPED,
  tick,
  withConfirmed,
  withRemoved,
} from './engine'

const T0 = 1_700_000_000_000
const minutes = (count: number): number => count * MS_PER_MINUTE

const settings: SportSettings = {
  intervalMinutes: 60,
  activities: [
    { id: 'situps', name: 'Situps' },
    { id: 'squats', name: 'Squats' },
  ],
  enabled: true,
}

describe('scheduleAt', () => {
  it('schedules the first fire one interval out', () => {
    expect(scheduleAt(settings, T0)).toEqual({
      scheduled: true,
      nextFireAt: T0 + minutes(60),
    })
  })
})

describe('tick', () => {
  it('reports nothing before Sports is due', () => {
    const state = scheduleAt(settings, T0)
    const result = tick(state, settings, T0 + minutes(59))

    expect(result.fired).toBe(false)
    expect(result.state).toEqual(state)
  })

  it('fires at the boundary and waits for an answer', () => {
    const result = tick(scheduleAt(settings, T0), settings, T0 + minutes(60))

    expect(result.fired).toBe(true)
    expect(result.state).toEqual({ scheduled: true, nextFireAt: null })
  })

  it('asks once however many intervals went by unanswered', () => {
    const fired = tick(scheduleAt(settings, T0), settings, T0 + minutes(60))
    const later = tick(fired.state, settings, T0 + minutes(600))

    expect(later.fired).toBe(false)
    expect(later.state).toEqual(fired.state)
  })

  it('drops the schedule once disabled or emptied of activities', () => {
    const state = scheduleAt(settings, T0)

    expect(
      tick(state, { ...settings, enabled: false }, T0 + minutes(60)),
    ).toEqual({
      state: STOPPED,
      fired: false,
    })
    expect(
      tick(state, { ...settings, activities: [] }, T0 + minutes(60)),
    ).toEqual({ state: STOPPED, fired: false })
  })

  it('does nothing while unscheduled', () => {
    expect(tick(STOPPED, settings, T0 + minutes(60))).toEqual({
      state: STOPPED,
      fired: false,
    })
  })
})

describe('withConfirmed', () => {
  it('starts the next interval from the answer, not from the boundary', () => {
    const fired = tick(
      scheduleAt(settings, T0),
      settings,
      T0 + minutes(60),
    ).state
    const answered = T0 + minutes(63)

    expect(withConfirmed(fired, settings, answered)).toEqual({
      scheduled: true,
      nextFireAt: answered + minutes(60),
    })
  })

  it('leaves a run that is not waiting for an answer alone', () => {
    const scheduled = scheduleAt(settings, T0)
    expect(withConfirmed(scheduled, settings, T0 + minutes(5))).toEqual(
      scheduled,
    )
  })

  it('does nothing while unscheduled', () => {
    expect(withConfirmed(STOPPED, settings, T0)).toEqual(STOPPED)
  })
})

describe('withRemoved', () => {
  it('drops the schedule', () => {
    expect(withRemoved()).toEqual(STOPPED)
  })
})

describe('snooze', () => {
  it('defers a waiting firing by extraMs', () => {
    const fired = tick(
      scheduleAt(settings, T0),
      settings,
      T0 + minutes(60),
    ).state
    expect(snooze(fired, T0 + minutes(60), minutes(5))).toEqual({
      scheduled: true,
      nextFireAt: T0 + minutes(65),
    })
  })

  it('does nothing when nothing is waiting', () => {
    const scheduled = scheduleAt(settings, T0)
    expect(snooze(scheduled, T0, minutes(5))).toEqual(scheduled)
    expect(snooze(STOPPED, T0, minutes(5))).toEqual(STOPPED)
  })
})

describe('setRemaining', () => {
  it('corrects a running countdown to targetMs from now', () => {
    const scheduled = scheduleAt(settings, T0)
    expect(setRemaining(scheduled, T0 + minutes(10), minutes(5))).toEqual({
      scheduled: true,
      nextFireAt: T0 + minutes(15),
    })
  })

  it('clamps a negative target to zero rather than rejecting it', () => {
    expect(setRemaining(scheduleAt(settings, T0), T0, -minutes(5))).toEqual({
      scheduled: true,
      nextFireAt: T0,
    })
  })

  it('does nothing while awaiting an answer or unscheduled', () => {
    const fired = tick(
      scheduleAt(settings, T0),
      settings,
      T0 + minutes(60),
    ).state
    expect(setRemaining(fired, T0 + minutes(60), minutes(5))).toEqual(fired)
    expect(setRemaining(STOPPED, T0, minutes(5))).toEqual(STOPPED)
  })
})

describe('addTime', () => {
  it('adds extraMs to a running countdown', () => {
    const scheduled = scheduleAt(settings, T0)
    expect(addTime(scheduled, minutes(5))).toEqual({
      scheduled: true,
      nextFireAt: T0 + minutes(65),
    })
  })

  it('does nothing while awaiting an answer or unscheduled', () => {
    const fired = tick(
      scheduleAt(settings, T0),
      settings,
      T0 + minutes(60),
    ).state
    expect(addTime(fired, minutes(5))).toEqual(fired)
    expect(addTime(STOPPED, minutes(5))).toEqual(STOPPED)
  })
})

describe('property: tick never advances a schedule past now', () => {
  it('every resulting nextFireAt is strictly after now', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 0, max: 10_000 }),
        (intervalMinutes, elapsedMinutes) => {
          const withInterval: SportSettings = { ...settings, intervalMinutes }
          const now = T0 + minutes(elapsedMinutes)
          const result = tick(scheduleAt(withInterval, T0), withInterval, now)
          if (result.state.nextFireAt !== null)
            expect(result.state.nextFireAt).toBeGreaterThan(now)
        },
      ),
    )
  })
})
