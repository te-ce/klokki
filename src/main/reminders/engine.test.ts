import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { MS_PER_MINUTE } from '../../shared/preset'
import type { ReminderDefinition } from '../../shared/reminder'
import {
  scheduleAt,
  snooze,
  tick,
  withRemoved,
  withScheduled,
  type RemindersState,
} from './engine'

const T0 = 1_700_000_000_000
const minutes = (count: number): number => count * MS_PER_MINUTE

const pushupsAndSquats: ReminderDefinition = {
  id: 'pushups',
  name: 'Pushups & squats',
  intervalMinutes: 60,
  steps: [
    { label: 'Pushups', unit: 'reps' },
    { label: 'Squats', unit: 'reps' },
  ],
  enabled: true,
}

const water: ReminderDefinition = {
  id: 'water',
  name: 'Drink water',
  intervalMinutes: 30,
  steps: [{ label: 'Drink a glass of water' }],
  enabled: true,
}

describe('scheduleAt', () => {
  it('schedules the first fire one interval out, on the first step', () => {
    expect(scheduleAt(pushupsAndSquats, T0)).toEqual({
      definitionId: 'pushups',
      nextFireAt: T0 + minutes(60),
      stepIndex: 0,
    })
  })
})

describe('tick', () => {
  it('reports nothing before a reminder is due', () => {
    const state: RemindersState = [scheduleAt(pushupsAndSquats, T0)]
    const result = tick(state, [pushupsAndSquats], T0 + minutes(59))

    expect(result.due).toEqual([])
    expect(result.state).toEqual(state)
  })

  it('fires the current step at the boundary and advances the cursor', () => {
    const state: RemindersState = [scheduleAt(pushupsAndSquats, T0)]
    const result = tick(state, [pushupsAndSquats], T0 + minutes(60))

    expect(result.due).toEqual([
      {
        definitionId: 'pushups',
        step: pushupsAndSquats.steps[0],
        at: T0 + minutes(60),
      },
    ])
    expect(result.state).toEqual([
      {
        definitionId: 'pushups',
        nextFireAt: T0 + minutes(120),
        stepIndex: 1,
      },
    ])
  })

  it('wraps the step cursor back to the first step', () => {
    const state: RemindersState = [
      { definitionId: 'pushups', nextFireAt: T0 + minutes(60), stepIndex: 1 },
    ]
    const result = tick(state, [pushupsAndSquats], T0 + minutes(60))

    expect(result.due).toEqual([
      {
        definitionId: 'pushups',
        step: pushupsAndSquats.steps[1],
        at: T0 + minutes(60),
      },
    ])
    expect(result.state[0]).toMatchObject({ stepIndex: 0 })
  })

  it('drains every boundary elapsed since the last tick, not just one', () => {
    const state: RemindersState = [scheduleAt(pushupsAndSquats, T0)]
    const result = tick(state, [pushupsAndSquats], T0 + minutes(180))

    expect(result.due.map((event) => event.step.label)).toEqual([
      'Pushups',
      'Squats',
      'Pushups',
    ])
    expect(result.state).toEqual([
      { definitionId: 'pushups', nextFireAt: T0 + minutes(240), stepIndex: 1 },
    ])
  })

  it('runs multiple reminders independently', () => {
    const state: RemindersState = [
      scheduleAt(pushupsAndSquats, T0),
      scheduleAt(water, T0),
    ]
    const result = tick(state, [pushupsAndSquats, water], T0 + minutes(60))

    expect(result.due.map((event) => event.definitionId).sort()).toEqual([
      'pushups',
      'water',
      'water',
    ])
  })

  it('drops a run whose definition disappeared or was disabled', () => {
    const state: RemindersState = [scheduleAt(pushupsAndSquats, T0)]

    expect(tick(state, [], T0 + minutes(60)).state).toEqual([])
    expect(
      tick(state, [{ ...pushupsAndSquats, enabled: false }], T0 + minutes(60))
        .state,
    ).toEqual([])
  })
})

describe('withScheduled', () => {
  it('adds a fresh schedule for a newly enabled reminder', () => {
    expect(withScheduled([], pushupsAndSquats, T0)).toEqual([
      scheduleAt(pushupsAndSquats, T0),
    ])
  })

  it('replaces any existing run for the same id', () => {
    const state: RemindersState = [
      { definitionId: 'pushups', nextFireAt: T0 + 5, stepIndex: 1 },
    ]
    expect(withScheduled(state, pushupsAndSquats, T0)).toEqual([
      scheduleAt(pushupsAndSquats, T0),
    ])
  })
})

describe('withRemoved', () => {
  it('drops the run for a disabled or deleted reminder', () => {
    const state: RemindersState = [
      scheduleAt(pushupsAndSquats, T0),
      scheduleAt(water, T0),
    ]
    expect(withRemoved(state, 'pushups')).toEqual([scheduleAt(water, T0)])
  })
})

describe('snooze', () => {
  it('reschedules the same step that just fired, not the next one', () => {
    const fired = tick(
      [scheduleAt(pushupsAndSquats, T0)],
      [pushupsAndSquats],
      T0 + minutes(60),
    ).state
    const result = snooze(fired, pushupsAndSquats, T0 + minutes(60), minutes(5))

    expect(result).toEqual([
      {
        definitionId: 'pushups',
        nextFireAt: T0 + minutes(65),
        stepIndex: 0,
      },
    ])
  })

  it('does nothing for a reminder with no running schedule', () => {
    expect(snooze([], pushupsAndSquats, T0, minutes(5))).toEqual([])
  })
})

describe('property: tick never advances a schedule past now', () => {
  it('every resulting nextFireAt is strictly after now', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 0, max: 10_000 }),
        (intervalMinutes, elapsedMinutes) => {
          const definition: ReminderDefinition = {
            ...pushupsAndSquats,
            intervalMinutes,
          }
          const now = T0 + minutes(elapsedMinutes)
          const result = tick([scheduleAt(definition, T0)], [definition], now)
          for (const run of result.state)
            expect(run.nextFireAt).toBeGreaterThan(now)
        },
      ),
    )
  })
})
