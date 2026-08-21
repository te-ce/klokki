import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MS_PER_MINUTE, type Preset } from '../../shared/preset'
import type { Clock } from '../timer/clock'
import { createTimerService } from '../timer/service'
import { wireAlerts } from './wire'

const T0 = 1_700_000_000_000

const preset = (notify: boolean): Preset => ({
  id: 'test',
  name: 'Test',
  loop: true,
  phases: [
    { label: 'Focus', minutes: 25, notify },
    { label: 'Break', minutes: 5, notify },
  ],
})

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

describe('wireAlerts', () => {
  it('raises one alert when a phase ends', () => {
    const service = createTimerService(clock)
    const present = vi.fn()
    wireAlerts(service, present)

    service.startPreset(preset(true))
    elapse(25 * MS_PER_MINUTE)

    expect(present).toHaveBeenCalledExactlyOnceWith({
      completedLabel: 'Focus',
      nextLabel: 'Break',
    })
    service.dispose()
  })

  it('says nothing while a phase is merely counting down', () => {
    const service = createTimerService(clock)
    const present = vi.fn()
    wireAlerts(service, present)

    service.startPreset(preset(true))
    elapse(10 * MS_PER_MINUTE)

    expect(present).not.toHaveBeenCalled()
    service.dispose()
  })

  // The acceptance criterion for waking from sleep: three phases elapsed while
  // the lid was shut, and the user gets told where they are, once.
  it('raises one alert for the boundary a slept-through run is holding at', () => {
    const service = createTimerService(clock)
    const present = vi.fn()
    wireAlerts(service, present)

    service.startPreset(preset(true))
    elapse(60 * MS_PER_MINUTE)

    // An hour asleep, and still the first boundary: the run stopped there
    // waiting to be answered, so there is nothing else to announce.
    expect(present).toHaveBeenCalledExactlyOnceWith({
      completedLabel: 'Focus',
      nextLabel: 'Break',
    })
    service.dispose()
  })

  it('stays silent for phases with notify unset', () => {
    const service = createTimerService(clock)
    const present = vi.fn()
    wireAlerts(service, present)

    service.startPreset(preset(false))
    elapse(30 * MS_PER_MINUTE)

    expect(present).not.toHaveBeenCalled()
    service.dispose()
  })
})
