import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MS_PER_MINUTE, type Preset } from '../../shared/preset'
import type { Clock } from '../timer/clock'
import { createTimerService } from '../timer/service'
import { recordHistory } from './record'

const T0 = 1_700_000_000_000

const sitStand: Preset = {
  id: 'sit-stand',
  name: 'Sit / stand',
  loop: true,
  phases: [
    { label: 'Sitting', minutes: 30, notify: true },
    { label: 'Standing', minutes: 15, notify: true },
  ],
}

let current = T0
const clock: Clock = { now: () => current }

const elapse = (ms: number): void => {
  current += ms
  vi.advanceTimersByTime(ms)
}

beforeEach(() => {
  vi.useFakeTimers()
  current = T0
})

afterEach(() => {
  vi.useRealTimers()
})

describe('recordHistory', () => {
  it('records one event per phase that ends', () => {
    const service = createTimerService(clock)
    const append = vi.fn()
    recordHistory(service, append)

    service.startPreset(sitStand)
    elapse(30 * MS_PER_MINUTE)

    expect(append).toHaveBeenCalledExactlyOnceWith({
      endedAt: T0 + 30 * MS_PER_MINUTE,
      presetId: 'sit-stand',
      phaseLabel: 'Sitting',
      durationMs: 30 * MS_PER_MINUTE,
      outcome: 'completed',
    })
    service.dispose()
  })

  it('records every phase that elapsed while the machine slept', () => {
    const service = createTimerService(clock)
    const append = vi.fn()
    recordHistory(service, append)

    service.startPreset(sitStand)
    // Wall-clock time moves while no poll fires — the lid was shut — so a single
    // tick has to drain the phases that passed in the dark, and log all of them.
    current += 50 * MS_PER_MINUTE
    vi.advanceTimersByTime(1_000)

    expect(
      append.mock.calls.map(([event]) => [event.phaseLabel, event.durationMs]),
    ).toEqual([
      ['Sitting', 30 * MS_PER_MINUTE],
      ['Standing', 15 * MS_PER_MINUTE],
    ])
    service.dispose()
  })

  it('records nothing while a phase is merely counting down', () => {
    const service = createTimerService(clock)
    const append = vi.fn()
    recordHistory(service, append)

    service.startPreset(sitStand)
    elapse(10 * MS_PER_MINUTE)

    expect(append).not.toHaveBeenCalled()
    service.dispose()
  })

  it('records the snoozed stretch as its own snoozed event', () => {
    const service = createTimerService(clock)
    const append = vi.fn()
    recordHistory(service, append)

    service.startPreset(sitStand)
    elapse(30 * MS_PER_MINUTE)
    // The user answers the overlay a couple of seconds after the boundary.
    elapse(2_000)
    service.snooze()
    elapse(5 * MS_PER_MINUTE)

    expect(append.mock.calls.map(([event]) => event)).toEqual([
      {
        endedAt: T0 + 30 * MS_PER_MINUTE,
        presetId: 'sit-stand',
        phaseLabel: 'Sitting',
        durationMs: 30 * MS_PER_MINUTE,
        outcome: 'completed',
      },
      // The five extra minutes, and no second full-length Sitting: the stretch
      // began at the boundary it deferred, so its duration is the snooze.
      {
        endedAt: T0 + 35 * MS_PER_MINUTE,
        presetId: 'sit-stand',
        phaseLabel: 'Sitting',
        durationMs: 5 * MS_PER_MINUTE,
        outcome: 'snoozed',
      },
    ])
    service.dispose()
  })

  it('records a skipped stretch as skipped, for the minutes it really lasted', () => {
    const service = createTimerService(clock)
    const append = vi.fn()
    recordHistory(service, append)

    service.startPreset(sitStand)
    elapse(12 * MS_PER_MINUTE)
    service.skip()

    expect(append).toHaveBeenCalledExactlyOnceWith({
      endedAt: T0 + 12 * MS_PER_MINUTE,
      presetId: 'sit-stand',
      phaseLabel: 'Sitting',
      // Twelve minutes of sitting, not the thirty it was configured for.
      durationMs: 12 * MS_PER_MINUTE,
      outcome: 'skipped',
    })
    service.dispose()
  })

  it('records a snoozed stretch that was then skipped as skipped', () => {
    const service = createTimerService(clock)
    const append = vi.fn()
    recordHistory(service, append)

    service.startPreset(sitStand)
    elapse(30 * MS_PER_MINUTE)
    elapse(2_000)
    service.snooze()
    elapse(60_000)
    service.skip()

    expect(append.mock.calls.map(([event]) => event.outcome)).toEqual([
      'completed',
      // The last thing that happened to the deferred stretch is that the user
      // cut it short; the minutes it granted are its duration either way.
      'skipped',
    ])
    service.dispose()
  })

  it('records nothing for a skip taken the instant a phase started', () => {
    const service = createTimerService(clock)
    const append = vi.fn()
    recordHistory(service, append)

    service.startPreset(sitStand)
    service.skip()

    // A zero-length stretch is not something that happened to the user.
    expect(append).not.toHaveBeenCalled()
    service.dispose()
  })

  it('stops recording once unsubscribed', () => {
    const service = createTimerService(clock)
    const append = vi.fn()
    const stop = recordHistory(service, append)

    stop()
    service.startPreset(sitStand)
    elapse(30 * MS_PER_MINUTE)

    expect(append).not.toHaveBeenCalled()
    service.dispose()
  })
})
