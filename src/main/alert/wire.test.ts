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

/** A second preset whose first phase ends at the same moment `preset`'s does. */
const twin: Preset = {
  id: 'twin',
  name: 'Twin',
  loop: true,
  phases: [
    { label: 'Sitting', minutes: 25, notify: true },
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

describe('wireAlerts', () => {
  it('raises one alert when a phase ends', () => {
    const service = createTimerService(clock)
    const present = vi.fn()
    wireAlerts(service, present, vi.fn())

    service.startPreset(preset(true))
    elapse(25 * MS_PER_MINUTE)

    expect(present).toHaveBeenCalledExactlyOnceWith({
      runId: 'test',
      completedLabel: 'Focus',
      nextLabel: 'Break',
    })
    service.dispose()
  })

  it('says nothing while a phase is merely counting down', () => {
    const service = createTimerService(clock)
    const present = vi.fn()
    wireAlerts(service, present, vi.fn())

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
    wireAlerts(service, present, vi.fn())

    service.startPreset(preset(true))
    elapse(60 * MS_PER_MINUTE)

    // An hour asleep, and still the first boundary: the run stopped there
    // waiting to be answered, so there is nothing else to announce.
    expect(present).toHaveBeenCalledExactlyOnceWith({
      runId: 'test',
      completedLabel: 'Focus',
      nextLabel: 'Break',
    })
    service.dispose()
  })

  it('stays silent for phases with notify unset', () => {
    const service = createTimerService(clock)
    const present = vi.fn()
    wireAlerts(service, present, vi.fn())

    service.startPreset(preset(false))
    elapse(30 * MS_PER_MINUTE)

    expect(present).not.toHaveBeenCalled()
    service.dispose()
  })

  // Two boundaries in one poll, and one overlay window. The second one is not
  // dropped: it waits, and the run behind it waits with it.
  it('shows the first of two simultaneous boundaries and queues the second', () => {
    const service = createTimerService(clock)
    const present = vi.fn()
    const close = vi.fn()
    const alerts = wireAlerts(service, present, close)

    service.startPreset(preset(true))
    service.startPreset(twin)
    elapse(25 * MS_PER_MINUTE)

    expect(present).toHaveBeenCalledExactlyOnceWith({
      runId: 'test',
      completedLabel: 'Focus',
      nextLabel: 'Break',
    })
    expect(alerts.showing()?.runId).toBe('test')
    // The queued run is still holding at its boundary — nothing has started
    // behind the user's back while its alert waits.
    expect(
      service.getView().runs.find((run) => run.runId === 'twin')?.awaiting,
    ).toBe(true)

    // Answering the one on screen closes it and brings the other forward.
    alerts.answered('test')
    expect(close).toHaveBeenCalledOnce()
    expect(present).toHaveBeenLastCalledWith({
      runId: 'twin',
      completedLabel: 'Sitting',
      nextLabel: 'Standing',
    })
    expect(alerts.showing()?.runId).toBe('twin')

    alerts.answered('twin')
    expect(alerts.showing()).toBeNull()
    service.dispose()
  })

  // The Timer pane and the tray can answer a boundary whose overlay never got a
  // window. It must not come round afterwards announcing a phase already begun.
  it('drops a queued boundary answered from somewhere that is not the overlay', () => {
    const service = createTimerService(clock)
    const present = vi.fn()
    const close = vi.fn()
    const alerts = wireAlerts(service, present, close)

    service.startPreset(preset(true))
    service.startPreset(twin)
    elapse(25 * MS_PER_MINUTE)
    present.mockClear()

    // The queued run's boundary, answered from the pane: no window of its own is
    // open, so nothing closes.
    alerts.answered('twin')
    expect(close).not.toHaveBeenCalled()
    expect(present).not.toHaveBeenCalled()
    expect(alerts.showing()?.runId).toBe('test')

    // And when the overlay on screen is answered, there is nothing behind it.
    alerts.answered('test')
    expect(close).toHaveBeenCalledOnce()
    expect(present).not.toHaveBeenCalled()
    expect(alerts.showing()).toBeNull()
    service.dispose()
  })

  it('leaves the overlay alone when a run with no alert is answered', () => {
    const service = createTimerService(clock)
    const present = vi.fn()
    const close = vi.fn()
    const alerts = wireAlerts(service, present, close)

    service.startPreset(preset(true))
    elapse(25 * MS_PER_MINUTE)

    alerts.answered('somebody-else')

    expect(close).not.toHaveBeenCalled()
    expect(alerts.showing()?.runId).toBe('test')
    service.dispose()
  })
})
