import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimerView } from '../../shared/timer'
import type { TimerUpdate } from '../timer/service'
import { createViewBroadcaster, type ViewTarget } from './broadcast'

const view = (countdown: string): TimerView => ({
  running: true,
  presetName: 'Pomodoro',
  phaseLabel: 'Focus',
  remainingMs: 1_000,
  countdown,
})

/** Stands in for the timer service: lets a test push an update by hand. */
const fakeSource = () => {
  const listeners = new Set<(update: TimerUpdate) => void>()
  return {
    subscribe: (listener: (update: TimerUpdate) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    push: (countdown: string) => {
      for (const listener of listeners)
        listener({ view: view(countdown), transitions: [], snoozed: null })
    },
    listenerCount: () => listeners.size,
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

let source: ReturnType<typeof fakeSource>

beforeEach(() => {
  source = fakeSource()
})

describe('createViewBroadcaster', () => {
  it('pushes every timer update to a registered target', () => {
    const broadcaster = createViewBroadcaster(source)
    const target = fakeTarget()

    broadcaster.register(target)
    source.push('24:59')

    expect(target.send).toHaveBeenCalledWith('klokki:timer-view', view('24:59'))
  })

  it('sends nothing to a target that has been unregistered', () => {
    const broadcaster = createViewBroadcaster(source)
    const target = fakeTarget()

    broadcaster.register(target)
    broadcaster.unregister(target)
    source.push('24:59')

    expect(target.send).not.toHaveBeenCalled()
    expect(broadcaster.targetCount()).toBe(0)
  })

  it('drops a destroyed target instead of sending to it', () => {
    const broadcaster = createViewBroadcaster(source)
    const target = fakeTarget()

    broadcaster.register(target)
    target.destroy()
    source.push('24:59')

    expect(target.send).not.toHaveBeenCalled()
    expect(broadcaster.targetCount()).toBe(0)
  })

  it('does not accumulate targets across open/close cycles', () => {
    const broadcaster = createViewBroadcaster(source)

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const target = fakeTarget()
      broadcaster.register(target)
      broadcaster.register(target)
      expect(broadcaster.targetCount()).toBe(1)
      broadcaster.unregister(target)
    }

    expect(broadcaster.targetCount()).toBe(0)
  })

  it('subscribes to the timer once and releases it on dispose', () => {
    const broadcaster = createViewBroadcaster(source)
    expect(source.listenerCount()).toBe(1)

    broadcaster.dispose()

    expect(source.listenerCount()).toBe(0)
    expect(broadcaster.targetCount()).toBe(0)
  })
})
