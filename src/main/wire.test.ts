import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC, PUSH } from '../shared/ipc'
import type { Preset } from '../shared/preset'
import type { SportSettings } from '../shared/sport'
import { createHistory, createSportsHistory } from './history'
import type { NotificationText } from './alert/notification'
import type { ViewTarget } from './ipc/broadcast'
import type { MenubarAction, MenubarItem } from './menubar/surface'
import type { PresetStore } from './presets/store'
import type { SportRunState } from './sports/engine'
import type { SportRunStore } from './sports/run-store'
import { createSportsService } from './sports/service'
import type { SportStore } from './sports/store'
import type { TimerView } from '../shared/timer'
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

/** A snapshot store with no file behind it, seeded with optional saved runs. */
const fakeSnapshot = (initial: readonly TimerState[] = []) => {
  let saved = initial
  const store: SnapshotStore & { load: () => readonly TimerState[] } = {
    save: (states) => {
      saved = states
    },
    clear: () => {
      saved = []
    },
    load: () => saved,
  }
  return store
}

/** A Sports store with no file behind it. */
const fakeSportsStore = (
  initial: SportSettings = {
    intervalMinutes: 60,
    activities: [{ id: 'situps', name: 'Situps' }],
    enabled: false,
  },
): SportStore => {
  let settings = initial
  const listeners = new Set<(next: SportSettings) => void>()
  return {
    get: () => settings,
    save: (next) => {
      settings = next
      for (const listener of listeners) listener(next)
      return { ok: true }
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** A Sports run store with no file behind it, seeded with an optional saved run. */
const fakeSportsRunStore = (
  initial: SportRunState = { scheduled: false, nextFireAt: null },
): SportRunStore & { load: () => SportRunState } => {
  let saved = initial
  return {
    save: (state) => {
      saved = state
    },
    clear: () => {
      saved = { scheduled: false, nextFireAt: null }
    },
    load: () => saved,
  }
}

let now = 0
const clock = { now: () => now }

const build = (
  initialSnapshot: readonly TimerState[] = [],
  options: {
    presets?: readonly Preset[]
    sports?: SportSettings
    sportsRun?: SportRunState
  } = {},
) => {
  const store = fakeStore(options.presets)
  const history = createHistory(
    mkdtempSync(join(tmpdir(), 'klokki-wire-')),
    clock,
  )
  const sportsHistory = createSportsHistory(
    mkdtempSync(join(tmpdir(), 'klokki-wire-sports-history-')),
    clock,
  )
  const service = createTimerService(clock)
  const snapshot = fakeSnapshot(initialSnapshot)
  const sportsStore = fakeSportsStore(options.sports)
  const sportsService = createSportsService(clock)
  const sportsRunStore = fakeSportsRunStore(options.sportsRun)
  const menubar = fakeMenubar()
  // Typed, because a test reads the notification's own Stop action back out of
  // these calls — the platform half of an alert, recorded rather than shown.
  const notifier = () => vi.fn<(text: NotificationText) => void>()
  // `withdraw` is the other half of voiding an alert: the overlay window closes
  // and the notification is taken back, so a stop is asserted on both.
  const alerts = { notify: notifier(), withdraw: vi.fn(), showOverlay: vi.fn() }
  const overlay = { close: vi.fn() }
  const sportsAlerts = {
    notify: notifier(),
    withdraw: vi.fn(),
    showOverlay: vi.fn(),
  }
  const sportsOverlay = { close: vi.fn() }
  const requests = new Map<string, (...args: readonly unknown[]) => unknown>()
  let onOpened: (window: WindowHandle) => void = () => {}

  const ports: AppPorts = {
    service,
    store,
    history,
    snapshot,
    sportsHistory,
    sportsStore,
    sportsService,
    sportsRunStore,
    loginItem: { isEnabled: () => false, setEnabled: () => true },
    requests: {
      handle: (channel, handler) => requests.set(channel, handler),
    },
    appInfo: () => ({ version: '1.0.0', electron: '43.0.0' }),
    menubar,
    alerts,
    overlay,
    sportsAlerts,
    sportsOverlay,
    windows: {
      onOpened: (listener) => {
        onOpened = listener
      },
    },
    openSettings: vi.fn(),
    quit: vi.fn(),
    clock,
  }

  const app = wireApp(ports)
  return {
    app,
    ports,
    store,
    history,
    sportsHistory,
    service,
    snapshot,
    sportsStore,
    sportsService,
    sportsRunStore,
    menubar,
    alerts,
    overlay,
    sportsAlerts,
    sportsOverlay,
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
    expect(wired.alerts.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Focus finished',
        body: 'Break starting now',
      }),
    )
    expect(wired.alerts.showOverlay).toHaveBeenCalledWith({
      runId: 'pomodoro',
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
    expect(wired.invoke(IPC.snoozeAlert, 'pomodoro', 5 * MINUTE)).toBe(true)
    expect(wired.overlay.close).toHaveBeenCalledOnce()
    elapse(5 * MINUTE)

    const today = wired.history.stats().today
    expect(today.completed).toBe(1)
    expect(today.minutesByLabel).toEqual([{ label: 'Focus', minutes: 30 }])
  })

  it('stops the run from the overlay it raised, and closes the overlay', () => {
    const wired = build()
    wired.invoke(IPC.startPreset, 'pomodoro')
    elapse(25 * MINUTE)

    wired.invoke(IPC.stopFromAlert, 'pomodoro')

    // The run is over rather than parked at the boundary, and the window that
    // announced it is gone: there is nothing left to answer.
    expect(wired.service.getView().runs).toEqual([])
    expect(wired.overlay.close).toHaveBeenCalledOnce()
    expect(wired.menubar.title()).toBe('')

    // And the break it was announcing never starts, however long we wait.
    elapse(10 * MINUTE)
    expect(wired.alerts.showOverlay).toHaveBeenCalledOnce()
    expect(wired.history.stats().today.minutesByLabel).toEqual([
      { label: 'Focus', minutes: 25 },
    ])
  })

  it('stops the same run from the notification the same alert raised', () => {
    const wired = build()
    wired.invoke(IPC.startPreset, 'pomodoro')
    elapse(25 * MINUTE)

    // The notification's Stop button, invoked the way macOS would.
    const [text] = wired.alerts.notify.mock.calls[0] ?? []
    expect(text?.actions.map((action) => action.label)).toEqual(['Stop Timer'])
    text?.actions[0]?.run()

    expect(wired.service.getView().runs).toEqual([])
    expect(wired.overlay.close).toHaveBeenCalledOnce()
  })

  it('voids the alert when the run is stopped from the tray', () => {
    const wired = build()
    wired.menubar.clickMenuItem('Start Pomodoro')
    elapse(25 * MINUTE)

    wired.menubar.clickMenuItem('Stop · Pomodoro')

    // Both halves of the alert go: the overlay would name a boundary that no
    // longer exists, and the notification sitting in Notification Center is the
    // half that outlives the window.
    expect(wired.overlay.close).toHaveBeenCalledOnce()
    expect(wired.alerts.withdraw).toHaveBeenCalledOnce()
    expect(wired.service.getView().runs).toEqual([])
  })

  it('voids the alert when the run is stopped from the settings window', () => {
    const wired = build()
    wired.invoke(IPC.startPreset, 'pomodoro')
    elapse(25 * MINUTE)

    wired.invoke(IPC.stopTimer, 'pomodoro')

    expect(wired.overlay.close).toHaveBeenCalledOnce()
    expect(wired.alerts.withdraw).toHaveBeenCalledOnce()
    expect(wired.service.getView().runs).toEqual([])
  })

  it('leaves the alert of a run that finished on its own standing', () => {
    const wired = build()
    wired.invoke(IPC.startPreset, 'pomodoro')
    elapse(25 * MINUTE)

    // Answering the first boundary voids its own alert, and that is the only
    // one voided here.
    wired.invoke(IPC.dismissAlert, 'pomodoro')
    elapse(5 * MINUTE)

    // The last phase of a preset that does not loop ends the run, so the timer
    // is idle — and "Timer finished" is exactly the alert the user still wants
    // on screen. A stop is a stop; reaching the end is not one.
    expect(wired.service.getView().runs).toEqual([])
    expect(wired.alerts.notify).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Break finished' }),
    )
    expect(wired.overlay.close).toHaveBeenCalledOnce()
    expect(wired.alerts.withdraw).toHaveBeenCalledOnce()
  })

  it('logs a skip and moves the tray on, without raising an alert', () => {
    const wired = build()
    const window = wired.openWindow()
    wired.invoke(IPC.startPreset, 'pomodoro')
    elapse(10 * MINUTE)

    expect(wired.invoke(IPC.skipPhase, 'pomodoro')).toBe(true)

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

    expect(wired.menubar.clickMenuItem('Skip to Break · Pomodoro')).toBe(true)

    expect(wired.menubar.title()).toBe(' Break 05:00')
  })

  it('ends the run when the last phase of a non-looping preset is skipped', () => {
    const wired = build()
    wired.invoke(IPC.startPreset, 'pomodoro')
    elapse(25 * MINUTE)
    // The Focus boundary, confirmed: Break is running and is the last phase.
    expect(wired.invoke(IPC.confirmNext, 'pomodoro')).toBe(true)
    elapse(MINUTE)

    expect(wired.invoke(IPC.skipPhase, 'pomodoro')).toBe(true)

    expect(wired.menubar.title()).toBe('')
    expect(wired.invoke(IPC.skipPhase, 'pomodoro')).toBe(false)
  })

  it('holds the tray at the boundary until it is confirmed', () => {
    const wired = build()
    wired.invoke(IPC.startPreset, 'pomodoro')

    elapse(25 * MINUTE)
    // Ten minutes of not noticing the overlay, and the break is still whole.
    elapse(10 * MINUTE)
    expect(wired.menubar.title()).toBe(' Break ready')
    expect(wired.history.stats().today.minutesByLabel).toEqual([
      { label: 'Focus', minutes: 25 },
    ])

    expect(wired.menubar.clickMenuItem('Start Break · Pomodoro')).toBe(true)

    expect(wired.menubar.title()).toBe(' Break 05:00')
  })

  it('declines a snooze whose new end has already gone by, and says so', () => {
    const wired = build()
    wired.invoke(IPC.startPreset, 'pomodoro')
    elapse(25 * MINUTE)
    // The overlay sat unanswered for longer than the snooze it was offering.
    elapse(6 * MINUTE)

    expect(wired.invoke(IPC.snoozeAlert, 'pomodoro', 5 * MINUTE)).toBe(false)
    expect(wired.overlay.close).toHaveBeenCalledOnce()
  })
})

/**
 * Two presets at once, all the way out. This is the only test that can say a
 * concurrent boundary reaches a notification, the log, the tray and every open
 * window — and that the run beside it is untouched by any of it.
 */
describe('two presets running at once', () => {
  /** A second preset whose phases are short enough to collide with Pomodoro's. */
  const sitStand: Preset = {
    id: 'sit-stand',
    name: 'Sit/Stand',
    loop: true,
    phases: [
      { label: 'Sitting', minutes: 30, notify: true },
      { label: 'Standing', minutes: 15, notify: true },
    ],
  }

  const both = (): readonly Preset[] => [pomodoro, sitStand]

  it('names both in the menubar title, in the order they were started', () => {
    const wired = build([], { presets: both() })

    wired.invoke(IPC.startPreset, 'pomodoro')
    wired.invoke(IPC.startPreset, 'sit-stand')
    elapse(MINUTE)

    expect(wired.menubar.title()).toBe(' Focus 24:00 · Sitting 29:00')
    // A section each, in run order, and the Sports heading below them intact.
    expect(wired.menubar.menuLabels().filter((label) => label !== '')).toEqual([
      'Pomodoro — Focus',
      'Skip to Break · Pomodoro',
      '+5 min · Pomodoro',
      'Stop · Pomodoro',
      'Sit/Stand — Sitting',
      'Skip to Standing · Sit/Stand',
      '+5 min · Sit/Stand',
      'Stop · Sit/Stand',
      'Restart Pomodoro',
      'Restart Sit/Stand',
      'Sports',
      'Start Sports',
      'Log Sports Now',
      'Settings…',
      'Quit Klokki',
    ])
  })

  it('gives each run its own boundary, alert, log line and pushed view', () => {
    const wired = build([], { presets: both() })
    const window = wired.openWindow()
    wired.invoke(IPC.startPreset, 'pomodoro')
    wired.invoke(IPC.startPreset, 'sit-stand')

    // Focus ends at 25 minutes; Sitting runs on to 30.
    elapse(25 * MINUTE)

    expect(wired.alerts.showOverlay).toHaveBeenCalledExactlyOnceWith({
      runId: 'pomodoro',
      completedLabel: 'Focus',
      nextLabel: 'Break',
    })
    expect(wired.history.stats().today.minutesByLabel).toEqual([
      { label: 'Focus', minutes: 25 },
    ])
    // Both runs are in the pushed view, and only one of them is holding.
    const pushed = window.on(PUSH.timerView).at(-1)?.payload as TimerView
    expect(pushed.runs.map((run) => [run.runId, run.awaiting])).toEqual([
      ['pomodoro', true],
      ['sit-stand', false],
    ])
    expect(wired.menubar.title()).toBe(' Break ready · Sitting 05:00')

    // Sitting reaches its own boundary five minutes later, and Pomodoro has not
    // moved an inch behind the one it is holding at.
    elapse(5 * MINUTE)
    expect(wired.history.stats().today.minutesByLabel).toEqual([
      { label: 'Sitting', minutes: 30 },
      { label: 'Focus', minutes: 25 },
    ])
    expect(wired.menubar.title()).toBe(' Break ready · Standing ready')
  })

  /**
   * The documented answer to two boundaries at once (see AGENTS.md): the overlay
   * window is one, so the second waits rather than being lost — and the run
   * behind it waits with it, because nothing starts unanswered.
   */
  it('queues a boundary raised while another run’s overlay is up', () => {
    const twin: Preset = { ...sitStand, phases: pomodoro.phases }
    const wired = build([], { presets: [pomodoro, twin] })
    wired.invoke(IPC.startPreset, 'pomodoro')
    wired.invoke(IPC.startPreset, 'sit-stand')

    elapse(25 * MINUTE)

    // One overlay, for the first run — and the second run is holding, named in
    // the tray, with nothing lost.
    expect(wired.alerts.showOverlay).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ runId: 'pomodoro' }),
    )
    expect(wired.menubar.title()).toBe(' Break ready · Break ready')
    expect(wired.menubar.menuLabels()).toContain('Start Break · Sit/Stand')

    // Answering the one on screen brings the other forward.
    wired.invoke(IPC.dismissAlert, 'pomodoro')
    expect(wired.overlay.close).toHaveBeenCalledOnce()
    expect(wired.alerts.showOverlay).toHaveBeenLastCalledWith({
      runId: 'sit-stand',
      completedLabel: 'Focus',
      nextLabel: 'Break',
    })
    expect(wired.menubar.title()).toBe(' Break 05:00 · Break ready')

    wired.invoke(IPC.dismissAlert, 'sit-stand')
    expect(wired.overlay.close).toHaveBeenCalledTimes(2)
    expect(wired.menubar.title()).toBe(' Break 05:00 · Break 05:00')
  })

  it('answers a queued boundary from the tray without disturbing the overlay', () => {
    const twin: Preset = { ...sitStand, phases: pomodoro.phases }
    const wired = build([], { presets: [pomodoro, twin] })
    wired.invoke(IPC.startPreset, 'pomodoro')
    wired.invoke(IPC.startPreset, 'sit-stand')
    elapse(25 * MINUTE)

    // The queued run, started from the tray while the other's overlay is up.
    expect(wired.menubar.clickMenuItem('Start Break · Sit/Stand')).toBe(true)

    // The window on screen is still the first run's: it is announcing a
    // boundary that is still perfectly answerable.
    expect(wired.overlay.close).not.toHaveBeenCalled()
    expect(wired.alerts.showOverlay).toHaveBeenCalledOnce()
    expect(wired.menubar.title()).toBe(' Break ready · Break 05:00')

    // And the answered run never comes round with an overlay of its own.
    wired.invoke(IPC.dismissAlert, 'pomodoro')
    expect(wired.alerts.showOverlay).toHaveBeenCalledOnce()
    expect(wired.overlay.close).toHaveBeenCalledOnce()
  })

  it('stops one run and voids only its alert', () => {
    const twin: Preset = { ...sitStand, phases: pomodoro.phases }
    const wired = build([], { presets: [pomodoro, twin] })
    wired.invoke(IPC.startPreset, 'pomodoro')
    wired.invoke(IPC.startPreset, 'sit-stand')
    elapse(25 * MINUTE)

    // The overlay's own Stop, for the run it is showing.
    wired.invoke(IPC.stopFromAlert, 'pomodoro')

    expect(wired.service.getView().runs.map((run) => run.runId)).toEqual([
      'sit-stand',
    ])
    // Both halves of that run's alert are gone, and the queued run's boundary
    // has taken the window it left.
    expect(wired.alerts.withdraw).toHaveBeenCalledOnce()
    expect(wired.alerts.showOverlay).toHaveBeenLastCalledWith(
      expect.objectContaining({ runId: 'sit-stand' }),
    )
    expect(wired.menubar.title()).toBe(' Break ready')
  })

  it('stops the run the notification names, not whichever ran last', () => {
    const wired = build([], { presets: both() })
    wired.invoke(IPC.startPreset, 'pomodoro')
    wired.invoke(IPC.startPreset, 'sit-stand')
    elapse(25 * MINUTE)

    const [text] = wired.alerts.notify.mock.calls.at(-1) ?? []
    text?.actions[0]?.run()

    expect(wired.service.getView().runs.map((run) => run.runId)).toEqual([
      'sit-stand',
    ])
  })

  it('commands from the settings window reach only the run they name', () => {
    const wired = build([], { presets: both() })
    wired.invoke(IPC.startPreset, 'pomodoro')
    wired.invoke(IPC.startPreset, 'sit-stand')
    elapse(10 * MINUTE)

    expect(wired.invoke(IPC.skipPhase, 'pomodoro')).toBe(true)
    expect(wired.invoke(IPC.addTime, 'sit-stand', 5 * MINUTE)).toBe(true)

    expect(wired.menubar.title()).toBe(' Break 05:00 · Sitting 25:00')
    // The skip is logged against the run that was skipped, and only it.
    expect(wired.history.stats().today.minutesByLabel).toEqual([
      { label: 'Focus', minutes: 10 },
    ])
  })

  it('restarting one preset leaves the other where it was', () => {
    const wired = build([], { presets: both() })
    wired.invoke(IPC.startPreset, 'pomodoro')
    wired.invoke(IPC.startPreset, 'sit-stand')
    elapse(10 * MINUTE)

    wired.invoke(IPC.startPreset, 'pomodoro')

    // One run per preset, still in the order they were started.
    expect(wired.menubar.title()).toBe(' Focus 25:00 · Sitting 20:00')
  })

  it('saves and restores every run across a restart', () => {
    const wired = build([], { presets: both() })
    wired.invoke(IPC.startPreset, 'pomodoro')
    wired.invoke(IPC.startPreset, 'sit-stand')
    elapse(10 * MINUTE)

    const saved = wired.snapshot.load()
    expect(
      saved.map((state) => (state.status === 'idle' ? null : state.preset.id)),
    ).toEqual(['pomodoro', 'sit-stand'])

    // A restart, sixteen minutes later: Pomodoro's Focus elapsed while the app
    // was shut and comes back holding; sit/stand is still counting.
    now = 26 * MINUTE
    const restarted = build(saved, { presets: both() })

    expect(restarted.menubar.title()).toBe(' Break ready · Sitting 04:00')
    expect(restarted.history.stats().today.minutesByLabel).toEqual([
      { label: 'Focus', minutes: 25 },
    ])
    expect(restarted.alerts.showOverlay).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ runId: 'pomodoro' }),
    )
  })

  it('stopping one run keeps the other in the snapshot', () => {
    const wired = build([], { presets: both() })
    wired.invoke(IPC.startPreset, 'pomodoro')
    wired.invoke(IPC.startPreset, 'sit-stand')

    wired.menubar.clickMenuItem('Stop · Pomodoro')

    expect(
      wired.snapshot
        .load()
        .map((state) => (state.status === 'idle' ? null : state.preset.id)),
    ).toEqual(['sit-stand'])
  })
})

describe('the running timer, saved for a restart', () => {
  it('saves the running state on every change, and clears it when the run ends', () => {
    const wired = build()
    wired.invoke(IPC.startPreset, 'pomodoro')

    expect(wired.snapshot.load()).toMatchObject([
      { status: 'running', phaseIndex: 0 },
    ])

    elapse(25 * MINUTE)
    // A boundary waiting to be answered is a run in progress, so it is saved:
    // a relaunch must not lose the phase the user was about to start.
    expect(wired.snapshot.load()).toMatchObject([
      { status: 'awaiting', phaseIndex: 1, completedIndex: 0 },
    ])

    wired.invoke(IPC.confirmNext, 'pomodoro')
    elapse(5 * MINUTE)
    wired.invoke(IPC.confirmNext, 'pomodoro')
    expect(wired.snapshot.load()).toEqual([])
  })

  it('clears the saved state when the run is stopped', () => {
    const wired = build()
    wired.invoke(IPC.startPreset, 'pomodoro')

    wired.menubar.clickMenuItem('Stop · Pomodoro')

    expect(wired.snapshot.load()).toEqual([])
  })

  it('resumes a saved run still in progress, picking up where wall-clock time says it should be', () => {
    now = 10 * MINUTE
    const wired = build([
      {
        status: 'running',
        preset: pomodoro,
        phaseIndex: 0,
        phaseStartedAt: 0,
        phaseEndsAt: 25 * MINUTE,
        snoozedMs: 0,
      },
    ])

    expect(wired.menubar.title()).toBe(' Focus 15:00')
  })

  it('drains a phase that finished while the app was closed, reaching history and the alert', () => {
    now = 26 * MINUTE
    const wired = build([
      {
        status: 'running',
        preset: pomodoro,
        phaseIndex: 0,
        phaseStartedAt: 0,
        phaseEndsAt: 25 * MINUTE,
        snoozedMs: 0,
      },
    ])

    expect(wired.alerts.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Focus finished',
        body: 'Break starting now',
      }),
    )
    expect(wired.history.stats().today.completed).toBe(1)
    // Not one minute into Break: it has not started, and starting it is what
    // the user is being asked about.
    expect(wired.menubar.title()).toBe(' Break ready')
    expect(wired.invoke(IPC.confirmNext, 'pomodoro')).toBe(true)
    expect(wired.menubar.title()).toBe(' Break 05:00')
  })

  it('resumes a boundary that was still waiting when the app was closed', () => {
    now = 40 * MINUTE
    const wired = build([
      {
        status: 'awaiting',
        preset: pomodoro,
        phaseIndex: 1,
        completedIndex: 0,
        boundaryAt: 25 * MINUTE,
      },
    ])

    // Fifteen minutes of the app being shut is not fifteen minutes of Break.
    expect(wired.menubar.title()).toBe(' Break ready')
    expect(wired.invoke(IPC.confirmNext, 'pomodoro')).toBe(true)
    expect(wired.menubar.title()).toBe(' Break 05:00')
  })
})

describe('Sports, all the way out', () => {
  const settings: SportSettings = {
    intervalMinutes: 60,
    activities: [
      { id: 'situps', name: 'Situps' },
      { id: 'squats', name: 'Squats' },
    ],
    enabled: true,
  }

  it('schedules Sports from the store on launch and persists it', () => {
    const wired = build([], { sports: settings })

    expect(wired.sportsRunStore.load()).toEqual({
      scheduled: true,
      nextFireAt: 60 * MINUTE,
    })
  })

  it('resumes a saved schedule instead of scheduling fresh', () => {
    now = 10 * MINUTE
    const wired = build([], {
      sports: settings,
      sportsRun: { scheduled: true, nextFireAt: 20 * MINUTE },
    })

    expect(wired.sportsService.getState()).toEqual({
      scheduled: true,
      nextFireAt: 20 * MINUTE,
    })
  })

  it('fires Sports that came due while the app was closed, and waits', () => {
    now = 61 * MINUTE
    const wired = build([], {
      sports: settings,
      sportsRun: { scheduled: true, nextFireAt: 60 * MINUTE },
    })

    expect(wired.sportsService.getState()).toEqual({
      scheduled: true,
      nextFireAt: null,
    })
    expect(wired.sportsAlerts.showOverlay).toHaveBeenCalledWith({
      activities: settings.activities,
    })
  })

  it('starts Sports from the tray menu, interval running from the click', () => {
    const wired = build([], { sports: settings })
    elapse(20 * MINUTE)

    expect(wired.menubar.clickMenuItem('Restart Sports')).toBe(true)

    expect(wired.sportsService.getState()).toEqual({
      scheduled: true,
      nextFireAt: 80 * MINUTE,
    })
    expect(wired.sportsRunStore.load()).toEqual({
      scheduled: true,
      nextFireAt: 80 * MINUTE,
    })
  })

  it('enables Sports that was off, started from the tray menu', () => {
    const wired = build([], { sports: { ...settings, enabled: false } })

    expect(wired.menubar.clickMenuItem('Start Sports')).toBe(true)

    expect(wired.sportsStore.get().enabled).toBe(true)
    expect(wired.sportsService.getState()).toEqual({
      scheduled: true,
      nextFireAt: 60 * MINUTE,
    })
  })

  it('starts the next interval from the answer, not from the boundary', () => {
    const wired = build([], { sports: settings })
    elapse(60 * MINUTE)
    elapse(5 * MINUTE)

    wired.invoke(IPC.confirmSports, { situps: 10, squats: 5 })

    expect(wired.sportsService.getState()).toEqual({
      scheduled: true,
      nextFireAt: 125 * MINUTE,
    })
  })

  it('fires Sports immediately from the tray, without waiting for the schedule', () => {
    const wired = build([], { sports: settings })
    elapse(20 * MINUTE)

    expect(wired.menubar.clickMenuItem('Log Sports Now')).toBe(true)

    expect(wired.sportsService.getState()).toEqual({
      scheduled: true,
      nextFireAt: null,
    })
    expect(wired.sportsAlerts.showOverlay).toHaveBeenCalledWith({
      activities: settings.activities,
    })
  })

  it('enables Sports that was off when fired from the tray', () => {
    const wired = build([], { sports: { ...settings, enabled: false } })

    expect(wired.menubar.clickMenuItem('Log Sports Now')).toBe(true)

    expect(wired.sportsStore.get().enabled).toBe(true)
    expect(wired.sportsService.getState()).toEqual({
      scheduled: true,
      nextFireAt: null,
    })
  })

  it('restarts the interval from the answer to a firing forced from the tray, same as a scheduled one', () => {
    const wired = build([], { sports: settings })
    elapse(20 * MINUTE)
    wired.menubar.clickMenuItem('Log Sports Now')
    elapse(5 * MINUTE)

    wired.invoke(IPC.confirmSports, { situps: 10, squats: 5 })

    expect(wired.sportsService.getState()).toEqual({
      scheduled: true,
      nextFireAt: 25 * MINUTE + 60 * MINUTE,
    })
  })

  it('hides Log Sports Now from the tray while a firing is already awaiting', () => {
    const wired = build([], { sports: settings })
    elapse(60 * MINUTE)

    expect(wired.menubar.menuLabels()).not.toContain('Log Sports Now')
  })

  it('drops the schedule when Sports is disabled', () => {
    const wired = build([], { sports: settings })

    wired.sportsStore.save({ ...settings, enabled: false })

    expect(wired.sportsRunStore.load()).toEqual({
      scheduled: false,
      nextFireAt: null,
    })
    expect(wired.sportsService.getState()).toEqual({
      scheduled: false,
      nextFireAt: null,
    })
  })

  it('pushes the Sports view, joined with its schedule, to every open window', () => {
    const wired = build([], { sports: { ...settings, enabled: false } })
    const window = wired.openWindow()

    wired.sportsStore.save(settings)

    expect(window.on(PUSH.sports).at(-1)).toEqual({
      channel: PUSH.sports,
      payload: {
        ...settings,
        nextFireAt: 60 * MINUTE,
        awaiting: false,
        remainingMs: 60 * MINUTE,
        countdown: '1:00:00',
      },
    })
  })

  it('shows both halves of the alert when Sports comes due', () => {
    const wired = build([], { sports: settings })

    elapse(60 * MINUTE)

    expect(wired.sportsAlerts.notify).toHaveBeenCalledOnce()
    expect(wired.sportsAlerts.showOverlay).toHaveBeenCalledWith({
      activities: settings.activities,
    })
  })

  it('reschedules by extraMs on snooze', () => {
    const wired = build([], { sports: settings })
    elapse(60 * MINUTE)

    expect(wired.invoke(IPC.snoozeSports, 10 * MINUTE)).toBe(true)

    expect(wired.sportsOverlay.close).toHaveBeenCalledOnce()
    expect(wired.sportsService.getState()).toEqual({
      scheduled: true,
      nextFireAt: 70 * MINUTE,
    })
  })

  it('closes the overlay and lets the engine advance on Done', () => {
    const wired = build([], { sports: settings })
    elapse(60 * MINUTE)

    wired.invoke(IPC.confirmSports, { situps: 10, squats: 5 })

    expect(wired.sportsOverlay.close).toHaveBeenCalledOnce()
  })

  it('disables Sports from the overlay it raised, leaving nothing half-fired', () => {
    const wired = build([], { sports: settings })
    elapse(60 * MINUTE)

    wired.invoke(IPC.stopSportsFromAlert)

    expect(wired.sportsStore.get().enabled).toBe(false)
    expect(wired.sportsService.getState()).toEqual({
      scheduled: false,
      nextFireAt: null,
    })
    expect(wired.sportsRunStore.load()).toEqual({
      scheduled: false,
      nextFireAt: null,
    })
    expect(wired.sportsOverlay.close).toHaveBeenCalledOnce()
    expect(wired.sportsHistory.stats().today.quantityByLabel).toEqual([])

    elapse(120 * MINUTE)
    expect(wired.sportsAlerts.showOverlay).toHaveBeenCalledOnce()
  })

  it('stops Sports from the notification the same alert raised', () => {
    const wired = build([], { sports: settings })
    elapse(60 * MINUTE)

    const [text] = wired.sportsAlerts.notify.mock.calls[0] ?? []
    expect(text?.actions.map((action) => action.label)).toEqual(['Stop Sports'])
    text?.actions[0]?.run()

    expect(wired.sportsStore.get().enabled).toBe(false)
    expect(wired.sportsOverlay.close).toHaveBeenCalledOnce()
  })

  it('voids the Sports alert when Sports is stopped from the settings window', () => {
    const wired = build([], { sports: settings })
    // A phase boundary is waiting too, with an overlay of its own up.
    wired.invoke(IPC.startPreset, 'pomodoro')
    elapse(60 * MINUTE)

    wired.invoke(IPC.stopSports)

    expect(wired.sportsOverlay.close).toHaveBeenCalledOnce()
    expect(wired.sportsAlerts.withdraw).toHaveBeenCalledOnce()
    // Only the alert of the thing that stopped: the timer is still holding at
    // its boundary, and its overlay is the way to answer it.
    expect(wired.overlay.close).not.toHaveBeenCalled()
    expect(wired.alerts.withdraw).not.toHaveBeenCalled()
  })

  it('voids the Sports alert when Sports is stopped from the tray', () => {
    const wired = build([], { sports: settings })
    elapse(60 * MINUTE)

    expect(wired.menubar.clickMenuItem('Stop Sports')).toBe(true)

    expect(wired.sportsOverlay.close).toHaveBeenCalledOnce()
    expect(wired.sportsAlerts.withdraw).toHaveBeenCalledOnce()
    expect(wired.sportsService.getState()).toEqual({
      scheduled: false,
      nextFireAt: null,
    })
  })

  it('logs a Done answer to Sports history, one line per activity, and tells every open window', () => {
    const wired = build([], { sports: settings })
    const window = wired.openWindow()
    elapse(60 * MINUTE)

    wired.invoke(IPC.confirmSports, { situps: 20, squats: 15 })

    expect(wired.sportsHistory.stats().today.quantityByLabel).toEqual([
      { label: 'Situps', quantity: 20 },
      { label: 'Squats', quantity: 15 },
    ])
    expect(window.on(PUSH.historyChanged).length).toBeGreaterThan(0)
  })

  it('logs Sports activity from the tab without touching the running schedule', () => {
    const wired = build([], { sports: settings })

    wired.invoke(IPC.logSports, { situps: 30 })

    expect(wired.sportsHistory.stats().today.quantityByLabel).toEqual([
      { label: 'Situps', quantity: 30 },
    ])
    // The schedule set on launch is untouched: a manual log never restarts it.
    expect(wired.sportsService.getState()).toEqual({
      scheduled: true,
      nextFireAt: 60 * MINUTE,
    })
  })
})

describe('the menubar, wired', () => {
  it('starts a preset by id from the menu, the same path as the window', () => {
    const wired = build()

    expect(wired.menubar.clickMenuItem('Start Pomodoro')).toBe(true)

    expect(wired.menubar.title()).toBe(' Focus 25:00')
    expect(wired.menubar.menuLabels()).toContain('Stop · Pomodoro')
  })

  it('shows an edited preset without a relaunch', () => {
    const wired = build()

    wired.store.rename('Deep work')

    expect(wired.menubar.menuLabels()).toContain('Start Deep work')
  })

  it('stops the timer from the menu', () => {
    const wired = build()
    wired.menubar.clickMenuItem('Start Pomodoro')

    wired.menubar.clickMenuItem('Stop · Pomodoro')

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
