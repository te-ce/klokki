import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC, PUSH } from '../shared/ipc'
import type { Preset } from '../shared/preset'
import { createHistory } from './history'
import type { ViewTarget } from './ipc/broadcast'
import type { MenubarAction, MenubarItem } from './menubar/surface'
import type { PresetStore } from './presets/store'
import type { TimerState } from './timer/machine'
import { createTimerService } from './timer/service'
import type { SnapshotStore } from './timer/snapshot'
import { wireApp, type AppPorts, type WindowHandle } from './wire'

const pomodoro: Preset = {
  id: 'pomodoro',
  name: 'Pomodoro',
  loop: false,
  phases: [
    { label: 'Focus', minutes: 25, notify: true },
    { label: 'Break', minutes: 5, notify: true },
  ],
}

const MINUTE = 60_000

/** A preset store with no file behind it. */
const fakeStore = (presets: readonly Preset[] = [pomodoro]) => {
  let list = presets
  const listeners = new Set<(next: readonly Preset[]) => void>()
  const store: PresetStore & { rename: (name: string) => void } = {
    list: () => list,
    save: () => ({ ok: true }),
    remove: () => {},
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    rename: (name) => {
      list = [{ ...pomodoro, name }]
      for (const listener of listeners) listener(list)
    },
  }
  return store
}

/** The menubar, recorded rather than drawn. */
const fakeMenubar = () => {
  let items: readonly MenubarItem[] = []
  let onAction: (action: MenubarAction) => void = () => {}
  let title = ''
  return {
    setTitle: (next: string) => {
      title = next
    },
    setToolTip: () => {},
    setMenu: (next: readonly MenubarItem[], handler: typeof onAction) => {
      items = next
      onAction = handler
    },
    title: () => title,
    menuLabels: () =>
      items.map((item) => (item.kind === 'separator' ? '' : item.label)),
    clickMenuItem: (label: string) => {
      const item = items.find(
        (candidate) =>
          candidate.kind === 'command' && candidate.label === label,
      )
      if (item?.kind !== 'command') return false
      onAction(item.action)
      return true
    },
  }
}

/** A window that records what was pushed to it. */
const fakeWindow = () => {
  const sent: { channel: string; payload?: unknown }[] = []
  let closed: (() => void) | null = null
  const target: ViewTarget = {
    isDestroyed: () => false,
    send: (channel, payload) => sent.push({ channel, payload }),
  }
  return {
    handle: {
      target,
      onClosed: (listener: () => void) => {
        closed = listener
      },
    } satisfies WindowHandle,
    sent,
    on: (channel: string) => sent.filter((entry) => entry.channel === channel),
    close: () => closed?.(),
  }
}

/** A snapshot store with no file behind it, seeded with an optional saved run. */
const fakeSnapshot = (initial: TimerState | null = null) => {
  let saved = initial
  const store: SnapshotStore & { load: () => TimerState | null } = {
    save: (state) => {
      saved = state
    },
    clear: () => {
      saved = null
    },
    load: () => saved,
  }
  return store
}

let now = 0
const clock = { now: () => now }

const build = (initialSnapshot: TimerState | null = null) => {
  const store = fakeStore()
  const history = createHistory(
    mkdtempSync(join(tmpdir(), 'klokki-wire-')),
    clock,
  )
  const service = createTimerService(clock)
  const snapshot = fakeSnapshot(initialSnapshot)
  const menubar = fakeMenubar()
  const alerts = { notify: vi.fn(), showOverlay: vi.fn() }
  const overlay = { close: vi.fn() }
  const requests = new Map<string, (...args: readonly unknown[]) => unknown>()
  let onOpened: (window: WindowHandle) => void = () => {}

  const ports: AppPorts = {
    service,
    store,
    history,
    snapshot,
    loginItem: { isEnabled: () => false, setEnabled: () => true },
    requests: {
      handle: (channel, handler) => requests.set(channel, handler),
    },
    appInfo: () => ({ version: '1.0.0', electron: '43.0.0' }),
    menubar,
    alerts,
    overlay,
    windows: {
      onOpened: (listener) => {
        onOpened = listener
      },
    },
    openSettings: vi.fn(),
    quit: vi.fn(),
  }

  const app = wireApp(ports)
  return {
    app,
    ports,
    store,
    history,
    service,
    snapshot,
    menubar,
    alerts,
    overlay,
    openWindow: () => {
      const window = fakeWindow()
      onOpened(window.handle)
      return window
    },
    invoke: (channel: string, ...args: readonly unknown[]) =>
      requests.get(channel)?.(...args),
  }
}

beforeEach(() => {
  now = 0
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Runs the app forward, letting the service's poll fire as it would. */
const elapse = (ms: number): void => {
  const step = 1_000
  for (let passed = 0; passed < ms; passed += step) {
    now += step
    vi.advanceTimersByTime(step)
  }
}

describe('a phase boundary, all the way out', () => {
  it('alerts, logs, and tells every open window', () => {
    const wired = build()
    const window = wired.openWindow()
    wired.invoke(IPC.startPreset, 'pomodoro')

    elapse(25 * MINUTE)

    // Both halves of the alert, because either one alone is missable.
    expect(wired.alerts.notify).toHaveBeenCalledWith({
      title: 'Focus finished',
      body: 'Break starting now',
    })
    expect(wired.alerts.showOverlay).toHaveBeenCalledWith({
      completedLabel: 'Focus',
      nextLabel: 'Break',
    })

    // The stretch that ended is in the log, and the window was told to re-read.
    expect(wired.history.stats().today.completed).toBe(1)
    expect(window.on(PUSH.historyChanged)).toHaveLength(1)

    // And the countdown has been arriving all along.
    expect(window.on(PUSH.timerView).length).toBeGreaterThan(1)
  })

  it('records the five minutes a snooze granted, not a second full phase', () => {
    const wired = build()
    wired.invoke(IPC.startPreset, 'pomodoro')
    elapse(25 * MINUTE)

    // The user answers the overlay a moment after the boundary.
    expect(wired.invoke(IPC.snoozeAlert)).toBe(true)
    expect(wired.overlay.close).toHaveBeenCalledOnce()
    elapse(5 * MINUTE)

    const today = wired.history.stats().today
    expect(today.completed).toBe(1)
    expect(today.minutesByLabel).toEqual([{ label: 'Focus', minutes: 30 }])
  })

  it('logs a skip and moves the tray on, without raising an alert', () => {
    const wired = build()
    const window = wired.openWindow()
    wired.invoke(IPC.startPreset, 'pomodoro')
    elapse(10 * MINUTE)

    expect(wired.invoke(IPC.skipPhase)).toBe(true)

    // The user asked for this boundary, so nothing interrupts them for it.
    expect(wired.alerts.notify).not.toHaveBeenCalled()
    expect(wired.alerts.showOverlay).not.toHaveBeenCalled()

    // The ten minutes really spent are in the log, and the window heard about it.
    const today = wired.history.stats().today
    expect(today.completed).toBe(0)
    expect(today.minutesByLabel).toEqual([{ label: 'Focus', minutes: 10 }])
    expect(window.on(PUSH.historyChanged)).toHaveLength(1)

    // And the break has started, at its full length.
    expect(wired.menubar.title()).toBe(' Break 05:00')
  })

  it('skips from the tray menu, the same path as the window', () => {
    const wired = build()
    wired.menubar.clickMenuItem('Start Pomodoro')
    elapse(MINUTE)

    expect(wired.menubar.clickMenuItem('Skip to Break')).toBe(true)

    expect(wired.menubar.title()).toBe(' Break 05:00')
  })

  it('ends the run when the last phase of a non-looping preset is skipped', () => {
    const wired = build()
    wired.invoke(IPC.startPreset, 'pomodoro')
    elapse(25 * MINUTE)
    elapse(MINUTE)

    expect(wired.invoke(IPC.skipPhase)).toBe(true)

    expect(wired.menubar.title()).toBe('')
    expect(wired.invoke(IPC.skipPhase)).toBe(false)
  })

  it('declines a snooze whose new end has already gone by, and says so', () => {
    const wired = build()
    wired.invoke(IPC.startPreset, 'pomodoro')
    elapse(25 * MINUTE)
    // The overlay sat unanswered for longer than the snooze it was offering.
    elapse(6 * MINUTE)

    expect(wired.invoke(IPC.snoozeAlert)).toBe(false)
    expect(wired.overlay.close).toHaveBeenCalledOnce()
  })
})

describe('the running timer, saved for a restart', () => {
  it('saves the running state on every change, and clears it when the run ends', () => {
    const wired = build()
    wired.invoke(IPC.startPreset, 'pomodoro')

    expect(wired.snapshot.load()).toMatchObject({
      status: 'running',
      phaseIndex: 0,
    })

    elapse(25 * MINUTE)
    expect(wired.snapshot.load()).toMatchObject({
      status: 'running',
      phaseIndex: 1,
    })

    elapse(5 * MINUTE)
    expect(wired.snapshot.load()).toBeNull()
  })

  it('clears the saved state when the run is stopped', () => {
    const wired = build()
    wired.invoke(IPC.startPreset, 'pomodoro')

    wired.menubar.clickMenuItem('Stop')

    expect(wired.snapshot.load()).toBeNull()
  })

  it('resumes a saved run still in progress, picking up where wall-clock time says it should be', () => {
    now = 10 * MINUTE
    const wired = build({
      status: 'running',
      preset: pomodoro,
      phaseIndex: 0,
      phaseStartedAt: 0,
      phaseEndsAt: 25 * MINUTE,
      snoozedMs: 0,
    })

    expect(wired.menubar.title()).toBe(' Focus 15:00')
  })

  it('drains a phase that finished while the app was closed, reaching history and the alert', () => {
    now = 26 * MINUTE
    const wired = build({
      status: 'running',
      preset: pomodoro,
      phaseIndex: 0,
      phaseStartedAt: 0,
      phaseEndsAt: 25 * MINUTE,
      snoozedMs: 0,
    })

    expect(wired.alerts.notify).toHaveBeenCalledWith({
      title: 'Focus finished',
      body: 'Break starting now',
    })
    expect(wired.history.stats().today.completed).toBe(1)
    expect(wired.menubar.title()).toBe(' Break 04:00')
  })
})

describe('the menubar, wired', () => {
  it('starts a preset by id from the menu, the same path as the window', () => {
    const wired = build()

    expect(wired.menubar.clickMenuItem('Start Pomodoro')).toBe(true)

    expect(wired.menubar.title()).toBe(' Focus 25:00')
    expect(wired.menubar.menuLabels()).toContain('Stop')
  })

  it('shows an edited preset without a relaunch', () => {
    const wired = build()

    wired.store.rename('Deep work')

    expect(wired.menubar.menuLabels()).toContain('Start Deep work')
  })

  it('stops the timer from the menu', () => {
    const wired = build()
    wired.menubar.clickMenuItem('Start Pomodoro')

    wired.menubar.clickMenuItem('Stop')

    expect(wired.menubar.title()).toBe('')
  })
})

describe('windows coming and going', () => {
  it('stops pushing to a window that has closed', () => {
    const wired = build()
    const window = wired.openWindow()
    wired.invoke(IPC.startPreset, 'pomodoro')
    elapse(2_000)
    const before = window.on(PUSH.timerView).length

    window.close()
    elapse(2_000)

    expect(window.on(PUSH.timerView)).toHaveLength(before)
  })

  it('pushes the saved list to every open window at once', () => {
    const wired = build()
    const first = wired.openWindow()
    const second = wired.openWindow()

    wired.store.rename('Deep work')

    expect(first.on(PUSH.presets)).toHaveLength(1)
    expect(second.on(PUSH.presets)).toHaveLength(1)
  })

  it('lets go of everything on quit', () => {
    const wired = build()
    const window = wired.openWindow()
    wired.invoke(IPC.startPreset, 'pomodoro')

    wired.app.dispose()
    elapse(60 * MINUTE)

    expect(wired.alerts.notify).not.toHaveBeenCalled()
    expect(window.on(PUSH.timerView)).toHaveLength(1)
  })
})
