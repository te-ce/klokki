import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Preset } from '../../shared/preset'
import type { TimerView } from '../../shared/timer'
import type { TimerUpdate } from '../timer/service'
import {
  createViewBroadcaster,
  type BroadcastSources,
  type ViewTarget,
} from './broadcast'

const view = (countdown: string): TimerView => ({
  running: true,
  presetName: 'Pomodoro',
  phaseLabel: 'Focus',
  remainingMs: 1_000,
  countdown,
})

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
    listenerCount: () => timer.size + presets.size + history.size,
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
    expect(source.listenerCount()).toBe(3)

    broadcaster.dispose()

    expect(source.listenerCount()).toBe(0)
    expect(broadcaster.targetCount()).toBe(0)
  })
})
