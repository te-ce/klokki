import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Preset } from '../../shared/preset'
import type { ReminderView } from '../../shared/reminder'
import type { SportsView } from '../../shared/sport'
import { runningView } from '../../shared/test-support/timer-view'
import type { TimerView } from '../../shared/timer'
import type { TimerUpdate } from '../timer/service'
import {
  createViewBroadcaster,
  type BroadcastSources,
  type ViewTarget,
} from './broadcast'

const view = (countdown: string): TimerView =>
  runningView({ countdown, remainingMs: 1_000 })

const pomodoro: Preset = {
  id: 'pomodoro',
  name: 'Pomodoro',
  loop: true,
  phases: [{ label: 'Focus', minutes: 25, notify: true }],
}

/** Stands in for the timer, the store and the log: pushed by hand. */
const fakeSources = () => {
  const timer = new Set<(update: TimerUpdate) => void>()
  const presets = new Set<(presets: readonly Preset[]) => void>()
  const history = new Set<() => void>()
  const reminderHistory = new Set<() => void>()
  const reminders = new Set<(reminders: readonly ReminderView[]) => void>()
  const sportsHistory = new Set<() => void>()
  const sports = new Set<(view: SportsView) => void>()

  const subscriber =
    <T>(set: Set<T>) =>
    (listener: T) => {
      set.add(listener)
      return () => set.delete(listener)
    }

  return {
    sources: {
      timer: { subscribe: subscriber(timer) },
      presets: { subscribe: subscriber(presets) },
      history: { subscribe: subscriber(history) },
      reminderHistory: { subscribe: subscriber(reminderHistory) },
      reminders: { subscribe: subscriber(reminders) },
      sportsHistory: { subscribe: subscriber(sportsHistory) },
      sports: { subscribe: subscriber(sports) },
    } satisfies BroadcastSources,
    pushView: (countdown: string) => {
      for (const listener of timer)
        listener({ view: view(countdown), transitions: [], snoozed: null })
    },
    pushPresets: (next: readonly Preset[]) => {
      for (const listener of presets) listener(next)
    },
    pushHistory: () => {
      for (const listener of history) listener()
    },
    pushReminderHistory: () => {
      for (const listener of reminderHistory) listener()
    },
    pushReminders: (next: readonly ReminderView[]) => {
      for (const listener of reminders) listener(next)
    },
    pushSportsHistory: () => {
      for (const listener of sportsHistory) listener()
    },
    pushSports: (next: SportsView) => {
      for (const listener of sports) listener(next)
    },
    listenerCount: () =>
      timer.size +
      presets.size +
      history.size +
      reminderHistory.size +
      reminders.size +
      sportsHistory.size +
      sports.size,
  }
}

/** Stands in for a window's webContents. */
const fakeTarget = (): ViewTarget & { destroy: () => void } => {
  let destroyed = false
  return {
    isDestroyed: () => destroyed,
    send: vi.fn(),
    destroy: () => {
      destroyed = true
    },
  }
}

let source: ReturnType<typeof fakeSources>

beforeEach(() => {
  source = fakeSources()
})

describe('createViewBroadcaster', () => {
  it('pushes every timer update to a registered target', () => {
    const broadcaster = createViewBroadcaster(source.sources)
    const target = fakeTarget()

    broadcaster.register(target)
    source.pushView('24:59')

    expect(target.send).toHaveBeenCalledWith('klokki:timer-view', view('24:59'))
  })

  it('pushes the saved preset list, so no window has to re-ask for it', () => {
    const broadcaster = createViewBroadcaster(source.sources)
    const target = fakeTarget()

    broadcaster.register(target)
    source.pushPresets([pomodoro])

    expect(target.send).toHaveBeenCalledWith('klokki:presets', [pomodoro])
  })

  it('announces a line written to the log, carrying nothing', () => {
    const broadcaster = createViewBroadcaster(source.sources)
    const target = fakeTarget()

    broadcaster.register(target)
    source.pushHistory()

    expect(target.send).toHaveBeenCalledWith(
      'klokki:history-changed',
      undefined,
    )
  })

  it('announces a line written to the reminder log, on the same channel as history', () => {
    const broadcaster = createViewBroadcaster(source.sources)
    const target = fakeTarget()

    broadcaster.register(target)
    source.pushReminderHistory()

    expect(target.send).toHaveBeenCalledWith(
      'klokki:history-changed',
      undefined,
    )
  })

  it('pushes the saved reminder list, so no window has to re-ask for it', () => {
    const broadcaster = createViewBroadcaster(source.sources)
    const target = fakeTarget()
    const water: ReminderView = {
      id: 'water',
      name: 'Drink water',
      intervalMinutes: 30,
      steps: [{ label: 'Drink a glass of water' }],
      enabled: true,
      nextFireAt: 1_800_000,
      awaiting: false,
    }

    broadcaster.register(target)
    source.pushReminders([water])

    expect(target.send).toHaveBeenCalledWith('klokki:reminders', [water])
  })

  it('announces a line written to the sports log, on the same channel as history', () => {
    const broadcaster = createViewBroadcaster(source.sources)
    const target = fakeTarget()

    broadcaster.register(target)
    source.pushSportsHistory()

    expect(target.send).toHaveBeenCalledWith(
      'klokki:history-changed',
      undefined,
    )
  })

  it('pushes the Sports view, so no window has to re-ask for it', () => {
    const broadcaster = createViewBroadcaster(source.sources)
    const target = fakeTarget()
    const sports: SportsView = {
      intervalMinutes: 60,
      activities: [{ id: 'situps', name: 'Situps' }],
      enabled: true,
      nextFireAt: 1_800_000,
      awaiting: false,
    }

    broadcaster.register(target)
    source.pushSports(sports)

    expect(target.send).toHaveBeenCalledWith('klokki:sports', sports)
  })

  it('sends nothing to a target that has been unregistered', () => {
    const broadcaster = createViewBroadcaster(source.sources)
    const target = fakeTarget()

    broadcaster.register(target)
    broadcaster.unregister(target)
    source.pushView('24:59')

    expect(target.send).not.toHaveBeenCalled()
    expect(broadcaster.targetCount()).toBe(0)
  })

  it('drops a destroyed target instead of sending to it', () => {
    const broadcaster = createViewBroadcaster(source.sources)
    const target = fakeTarget()

    broadcaster.register(target)
    target.destroy()
    source.pushView('24:59')

    expect(target.send).not.toHaveBeenCalled()
    expect(broadcaster.targetCount()).toBe(0)
  })

  it('drops a destroyed target on any channel, not only the timer', () => {
    const broadcaster = createViewBroadcaster(source.sources)
    const target = fakeTarget()

    broadcaster.register(target)
    target.destroy()
    source.pushHistory()

    expect(target.send).not.toHaveBeenCalled()
    expect(broadcaster.targetCount()).toBe(0)
  })

  it('does not accumulate targets across open/close cycles', () => {
    const broadcaster = createViewBroadcaster(source.sources)

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const target = fakeTarget()
      broadcaster.register(target)
      broadcaster.register(target)
      expect(broadcaster.targetCount()).toBe(1)
      broadcaster.unregister(target)
    }

    expect(broadcaster.targetCount()).toBe(0)
  })

  it('subscribes to each source once and releases them all on dispose', () => {
    const broadcaster = createViewBroadcaster(source.sources)
    expect(source.listenerCount()).toBe(7)

    broadcaster.dispose()

    expect(source.listenerCount()).toBe(0)
    expect(broadcaster.targetCount()).toBe(0)
  })
})
