import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MS_PER_MINUTE } from '../../shared/preset'
import type { ReminderDefinition } from '../../shared/reminder'
import type { Clock } from '../timer/clock'
import { createReminderService } from './service'

const T0 = 1_700_000_000_000
const minutes = (count: number): number => count * MS_PER_MINUTE

const createTestClock = (): Clock & { advance: (ms: number) => void } => {
  let current = T0
  return {
    now: () => current,
    advance: (ms) => {
      current += ms
    },
  }
}

let clock: ReturnType<typeof createTestClock>

beforeEach(() => {
  vi.useFakeTimers()
  clock = createTestClock()
})

afterEach(() => {
  vi.useRealTimers()
})

const elapse = (ms: number): void => {
  clock.advance(ms)
  vi.advanceTimersByTime(ms)
}

const water: ReminderDefinition = {
  id: 'water',
  name: 'Drink water',
  intervalMinutes: 30,
  steps: [{ label: 'Drink a glass of water' }],
  enabled: true,
}

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

describe('createReminderService', () => {
  it('starts with nothing scheduled', () => {
    const service = createReminderService(clock)

    expect(service.getState()).toEqual([])
    service.dispose()
  })

  it('schedules a newly enabled reminder and fires it at the boundary', () => {
    const service = createReminderService(clock)
    const seen: (readonly { definitionId: string }[])[] = []
    service.subscribe((due) => seen.push(due))

    service.setDefinitions([water])
    elapse(minutes(30))

    expect(seen).toEqual([
      [{ definitionId: 'water', step: water.steps[0], at: T0 + minutes(30) }],
    ])
    service.dispose()
  })

  it('runs multiple reminders independently', () => {
    const service = createReminderService(clock)
    const seen: string[] = []
    service.subscribe((due) => {
      for (const event of due) seen.push(event.definitionId)
    })

    service.setDefinitions([water, pushupsAndSquats])
    elapse(minutes(60))

    // Water is due twice over the hour but asks once: its first firing is still
    // unanswered, so its second interval never started.
    expect(seen.sort()).toEqual(['pushups', 'water'])
    service.dispose()
  })

  it('starts the next interval only once the fired step is confirmed', () => {
    const service = createReminderService(clock)
    const seen: string[] = []
    service.subscribe((due) => {
      for (const event of due) seen.push(event.definitionId)
    })

    service.setDefinitions([water])
    elapse(minutes(30))
    expect(seen).toEqual(['water'])

    // Answered ten minutes late: the interval that follows is a whole thirty
    // minutes from the answer, not from the boundary.
    elapse(minutes(10))
    expect(service.confirm('water')).toBe(true)
    elapse(minutes(29))
    expect(seen).toEqual(['water'])
    elapse(minutes(1))
    expect(seen).toEqual(['water', 'water'])
    service.dispose()
  })

  it('restarts a reminder on demand, whether or not it was scheduled', () => {
    const service = createReminderService(clock)
    const seen: string[] = []
    service.subscribe((due) => {
      for (const event of due) seen.push(event.definitionId)
    })

    service.setDefinitions([water])
    elapse(minutes(20))
    // What the tray's "Restart Drink water" does: a full interval from now, so
    // the ten minutes it had left are not what the user gets.
    expect(service.start('water')).toBe(true)
    elapse(minutes(29))
    expect(seen).toEqual([])
    elapse(minutes(1))
    expect(seen).toEqual(['water'])
    service.dispose()
  })

  it('has nothing to start or confirm for an unknown reminder', () => {
    const service = createReminderService(clock)
    service.setDefinitions([water])

    expect(service.start('nope')).toBe(false)
    expect(service.confirm('nope')).toBe(false)
    service.dispose()
  })

  it('stops a reminder that becomes disabled and does not fire it', () => {
    const service = createReminderService(clock)
    const listener = vi.fn()
    service.subscribe(listener)

    service.setDefinitions([water])
    service.setDefinitions([{ ...water, enabled: false }])
    elapse(minutes(30))

    expect(listener).not.toHaveBeenCalled()
    expect(service.getState()).toEqual([])
    service.dispose()
  })

  it('drops a reminder that was deleted', () => {
    const service = createReminderService(clock)
    service.setDefinitions([water])

    service.setDefinitions([])

    expect(service.getState()).toEqual([])
    service.dispose()
  })

  it('resumes a schedule loaded from disk instead of rescheduling fresh', () => {
    const service = createReminderService(clock)
    const loaded = [
      { definitionId: 'water', nextFireAt: T0 + minutes(5), stepIndex: 0 },
    ]

    service.resume(loaded, [water])

    expect(service.getState()).toEqual(loaded)
    service.dispose()
  })

  it('fires transitions already due at resume, e.g. after time asleep', () => {
    const service = createReminderService(clock)
    const listener = vi.fn()
    service.subscribe(listener)

    service.resume(
      [{ definitionId: 'water', nextFireAt: T0 - 1, stepIndex: 0 }],
      [water],
    )

    expect(listener).toHaveBeenCalledWith([
      { definitionId: 'water', step: water.steps[0], at: T0 - 1 },
    ])
    service.dispose()
  })

  it('snoozes the step that just fired rather than advancing to the next', () => {
    const service = createReminderService(clock)
    service.setDefinitions([pushupsAndSquats])
    elapse(minutes(60))

    const snoozed = service.snooze('pushups', minutes(5))

    expect(snoozed).toBe(true)
    expect(service.getState()).toEqual([
      { definitionId: 'pushups', nextFireAt: T0 + minutes(65), stepIndex: 0 },
    ])
    service.dispose()
  })

  it('reports false when there is nothing running to snooze', () => {
    const service = createReminderService(clock)

    expect(service.snooze('water', minutes(5))).toBe(false)
    service.dispose()
  })

  it('stops polling once nothing is scheduled', () => {
    const service = createReminderService(clock)
    service.setDefinitions([water])

    service.setDefinitions([])

    expect(vi.getTimerCount()).toBe(0)
    service.dispose()
  })
})
