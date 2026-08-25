import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC, PUSH } from '../shared/ipc'
import type { Preset } from '../shared/preset'
import type { ReminderDefinition } from '../shared/reminder'
import type { SportSettings } from '../shared/sport'
import {
  createHistory,
  createReminderHistory,
  createSportsHistory,
} from './history'
import type { ViewTarget } from './ipc/broadcast'
import type { MenubarAction, MenubarItem } from './menubar/surface'
import type { PresetStore } from './presets/store'
import type { RemindersState } from './reminders/engine'
import type { ReminderRunStore } from './reminders/run-store'
import { createReminderService } from './reminders/service'
import type { ReminderStore } from './reminders/store'
import type { SportRunState } from './sports/engine'
import type { SportRunStore } from './sports/run-store'
import { createSportsService } from './sports/service'
import type { SportStore } from './sports/store'
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

/** A reminder store with no file behind it. */
const fakeReminderStore = (
  reminders: readonly ReminderDefinition[] = [],
): ReminderStore => {
  let list = reminders
  const listeners = new Set<(next: readonly ReminderDefinition[]) => void>()
  return {
    list: () => list,
    save: (definition) => {
      list = [...list.filter((d) => d.id !== definition.id), definition]
      for (const listener of listeners) listener(list)
      return { ok: true }
    },
    remove: (id) => {
      list = list.filter((d) => d.id !== id)
      for (const listener of listeners) listener(list)
    },
    setEnabled: (id, enabled) => {
      list = list.map((d) => (d.id === id ? { ...d, enabled } : d))
      for (const listener of listeners) listener(list)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** A reminder run store with no file behind it, seeded with an optional saved run. */
const fakeReminderRunStore = (
  initial: RemindersState = [],
): ReminderRunStore & { load: () => RemindersState } => {
  let saved = initial
  return {
    save: (state) => {
      saved = state
    },
    clear: () => {
      saved = []
    },
    load: () => saved,
  }
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
  initialSnapshot: TimerState | null = null,
  options: {
    reminders?: readonly ReminderDefinition[]
    reminderRun?: RemindersState
    sports?: SportSettings
    sportsRun?: SportRunState
  } = {},
) => {
  const store = fakeStore()
  const history = createHistory(
    mkdtempSync(join(tmpdir(), 'klokki-wire-')),
    clock,
  )
  const reminderHistory = createReminderHistory(
    mkdtempSync(join(tmpdir(), 'klokki-wire-reminder-history-')),
    clock,
  )
  const sportsHistory = createSportsHistory(
    mkdtempSync(join(tmpdir(), 'klokki-wire-sports-history-')),
    clock,
  )
  const service = createTimerService(clock)
  const snapshot = fakeSnapshot(initialSnapshot)
  const reminderStore = fakeReminderStore(options.reminders)
  const reminderService = createReminderService(clock)
  const reminderRunStore = fakeReminderRunStore(options.reminderRun)
  const sportsStore = fakeSportsStore(options.sports)
  const sportsService = createSportsService(clock)
  const sportsRunStore = fakeSportsRunStore(options.sportsRun)
  const menubar = fakeMenubar()
  const alerts = { notify: vi.fn(), showOverlay: vi.fn() }
  const overlay = { close: vi.fn() }
  const reminderAlerts = { notify: vi.fn(), showOverlay: vi.fn() }
  const reminderOverlay = { close: vi.fn() }
  const sportsAlerts = { notify: vi.fn(), showOverlay: vi.fn() }
  const sportsOverlay = { close: vi.fn() }
  const requests = new Map<string, (...args: readonly unknown[]) => unknown>()
  let onOpened: (window: WindowHandle) => void = () => {}

  const ports: AppPorts = {
    service,
    store,
    history,
    reminderHistory,
    snapshot,
    reminderStore,
    reminderService,
    reminderRunStore,
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
    reminderAlerts,
    reminderOverlay,
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
    reminderHistory,
    sportsHistory,
    service,
    snapshot,
    reminderStore,
    reminderService,
    reminderRunStore,
    sportsStore,
    sportsService,
    sportsRunStore,
    menubar,
    alerts,
    overlay,
    reminderAlerts,
    reminderOverlay,
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
    expect(wired.invoke(IPC.snoozeAlert, 5 * MINUTE)).toBe(true)
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
    // The Focus boundary, confirmed: Break is running and is the last phase.
    expect(wired.invoke(IPC.confirmNext)).toBe(true)
    elapse(MINUTE)

    expect(wired.invoke(IPC.skipPhase)).toBe(true)

    expect(wired.menubar.title()).toBe('')
    expect(wired.invoke(IPC.skipPhase)).toBe(false)
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

    expect(wired.menubar.clickMenuItem('Start Break')).toBe(true)

    expect(wired.menubar.title()).toBe(' Break 05:00')
  })

  it('declines a snooze whose new end has already gone by, and says so', () => {
    const wired = build()
    wired.invoke(IPC.startPreset, 'pomodoro')
    elapse(25 * MINUTE)
    // The overlay sat unanswered for longer than the snooze it was offering.
    elapse(6 * MINUTE)

    expect(wired.invoke(IPC.snoozeAlert, 5 * MINUTE)).toBe(false)
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
    // A boundary waiting to be answered is a run in progress, so it is saved:
    // a relaunch must not lose the phase the user was about to start.
    expect(wired.snapshot.load()).toMatchObject({
      status: 'awaiting',
      phaseIndex: 1,
      completedIndex: 0,
    })

    wired.invoke(IPC.confirmNext)
    elapse(5 * MINUTE)
    wired.invoke(IPC.confirmNext)
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
    // Not one minute into Break: it has not started, and starting it is what
    // the user is being asked about.
    expect(wired.menubar.title()).toBe(' Break ready')
    expect(wired.invoke(IPC.confirmNext)).toBe(true)
    expect(wired.menubar.title()).toBe(' Break 05:00')
  })

  it('resumes a boundary that was still waiting when the app was closed', () => {
    now = 40 * MINUTE
    const wired = build({
      status: 'awaiting',
      preset: pomodoro,
      phaseIndex: 1,
      completedIndex: 0,
      boundaryAt: 25 * MINUTE,
    })

    // Fifteen minutes of the app being shut is not fifteen minutes of Break.
    expect(wired.menubar.title()).toBe(' Break ready')
    expect(wired.invoke(IPC.confirmNext)).toBe(true)
    expect(wired.menubar.title()).toBe(' Break 05:00')
  })
})

describe('reminders, saved for a restart', () => {
  const water: ReminderDefinition = {
    id: 'water',
    name: 'Drink water',
    intervalMinutes: 30,
    steps: [{ label: 'Drink a glass of water' }],
    enabled: true,
  }

  it('schedules a reminder from the store on launch and persists it', () => {
    const wired = build(null, { reminders: [water] })

    expect(wired.reminderRunStore.load()).toEqual([
      { definitionId: 'water', nextFireAt: 30 * MINUTE, stepIndex: 0 },
    ])
  })

  it('resumes a saved schedule instead of rescheduling fresh', () => {
    now = 10 * MINUTE
    const wired = build(null, {
      reminders: [water],
      reminderRun: [
        { definitionId: 'water', nextFireAt: 20 * MINUTE, stepIndex: 0 },
      ],
    })

    expect(wired.reminderService.getState()).toEqual([
      { definitionId: 'water', nextFireAt: 20 * MINUTE, stepIndex: 0 },
    ])
  })

  it('fires a reminder that came due while the app was closed, and waits', () => {
    now = 31 * MINUTE
    const wired = build(null, {
      reminders: [water],
      reminderRun: [
        { definitionId: 'water', nextFireAt: 30 * MINUTE, stepIndex: 0 },
      ],
    })

    // No next interval yet: the glass of water has not been answered for.
    expect(wired.reminderService.getState()).toEqual([
      { definitionId: 'water', nextFireAt: null, stepIndex: 0 },
    ])
    expect(wired.reminderAlerts.showOverlay).toHaveBeenCalledOnce()
  })

  it('starts a reminder from the tray menu, interval running from the click', () => {
    const wired = build(null, { reminders: [water] })
    elapse(20 * MINUTE)

    expect(wired.menubar.clickMenuItem('Restart Drink water')).toBe(true)

    expect(wired.reminderService.getState()).toEqual([
      { definitionId: 'water', nextFireAt: 50 * MINUTE, stepIndex: 0 },
    ])
    expect(wired.reminderRunStore.load()).toEqual([
      { definitionId: 'water', nextFireAt: 50 * MINUTE, stepIndex: 0 },
    ])
  })

  it('enables a disabled reminder started from the tray menu', () => {
    const wired = build(null, {
      reminders: [{ ...water, enabled: false }],
    })

    expect(wired.menubar.clickMenuItem('Start Drink water')).toBe(true)

    expect(wired.reminderStore.list()).toEqual([water])
    expect(wired.reminderService.getState()).toEqual([
      { definitionId: 'water', nextFireAt: 30 * MINUTE, stepIndex: 0 },
    ])
  })

  it('starts the next interval from the answer, not from the boundary', () => {
    const wired = build(null, { reminders: [water] })
    elapse(30 * MINUTE)
    // Five minutes to get to the overlay: the next glass is thirty minutes
    // after the answer, so the wait is not taken out of the interval.
    elapse(5 * MINUTE)

    wired.invoke(IPC.completeReminder, null)

    expect(wired.reminderService.getState()).toEqual([
      { definitionId: 'water', nextFireAt: 65 * MINUTE, stepIndex: 0 },
    ])
  })

  it('schedules a reminder created after launch, and persists it', () => {
    const wired = build()

    wired.reminderStore.save(water)

    expect(wired.reminderRunStore.load()).toEqual([
      { definitionId: 'water', nextFireAt: 30 * MINUTE, stepIndex: 0 },
    ])
  })

  it('drops the schedule when a reminder is disabled', () => {
    const wired = build(null, { reminders: [water] })

    wired.reminderStore.setEnabled('water', false)

    expect(wired.reminderRunStore.load()).toEqual([])
    expect(wired.reminderService.getState()).toEqual([])
  })

  it('pushes the reminder list, joined with its schedule, to every open window', () => {
    const wired = build()
    const window = wired.openWindow()

    wired.reminderStore.save(water)

    expect(window.on(PUSH.reminders)).toEqual([
      {
        channel: PUSH.reminders,
        payload: [{ ...water, nextFireAt: 30 * MINUTE, awaiting: false }],
      },
    ])
  })

  it('reflects a disabled reminder losing its schedule in the pushed list', () => {
    const wired = build(null, { reminders: [water] })
    const window = wired.openWindow()

    wired.reminderStore.setEnabled('water', false)

    expect(window.on(PUSH.reminders).at(-1)).toEqual({
      channel: PUSH.reminders,
      payload: [
        { ...water, enabled: false, nextFireAt: null, awaiting: false },
      ],
    })
  })

  it('shows both halves of the alert when a reminder comes due', () => {
    const wired = build(null, { reminders: [water] })

    elapse(30 * MINUTE)

    expect(wired.reminderAlerts.notify).toHaveBeenCalledOnce()
    expect(wired.reminderAlerts.showOverlay).toHaveBeenCalledWith({
      label: 'Drink a glass of water',
      unit: null,
    })
  })

  it('reschedules the same step on snooze rather than skipping it', () => {
    const wired = build(null, { reminders: [water] })
    elapse(30 * MINUTE)

    expect(wired.invoke(IPC.snoozeReminder, 10 * MINUTE)).toBe(true)

    expect(wired.reminderOverlay.close).toHaveBeenCalledOnce()
    expect(wired.reminderService.getState()).toEqual([
      { definitionId: 'water', nextFireAt: 40 * MINUTE, stepIndex: 0 },
    ])
  })

  it('closes the overlay and lets the engine advance on Done', () => {
    const wired = build(null, { reminders: [water] })
    elapse(30 * MINUTE)

    wired.invoke(IPC.completeReminder, null)

    expect(wired.reminderOverlay.close).toHaveBeenCalledOnce()
  })

  it('queues a second reminder due before the first is answered', () => {
    const pushups: ReminderDefinition = {
      id: 'pushups',
      name: 'Pushups',
      intervalMinutes: 30,
      steps: [{ label: 'Pushups', unit: 'reps' }],
      enabled: true,
    }
    const wired = build(null, { reminders: [water, pushups] })

    elapse(30 * MINUTE)

    expect(wired.reminderAlerts.showOverlay).toHaveBeenCalledTimes(1)

    wired.invoke(IPC.completeReminder, null)

    expect(wired.reminderAlerts.showOverlay).toHaveBeenCalledTimes(2)
    expect(wired.reminderAlerts.showOverlay).toHaveBeenLastCalledWith({
      label: 'Pushups',
      unit: 'reps',
    })
  })

  it('logs a Done answer to reminder history and tells every open window', () => {
    const pushups: ReminderDefinition = {
      id: 'pushups',
      name: 'Pushups',
      intervalMinutes: 30,
      steps: [{ label: 'Pushups', unit: 'reps' }],
      enabled: true,
    }
    const wired = build(null, { reminders: [pushups] })
    const window = wired.openWindow()
    elapse(30 * MINUTE)

    wired.invoke(IPC.completeReminder, 20)

    expect(wired.reminderHistory.stats().today.quantityByLabel).toEqual([
      { label: 'Pushups', quantity: 20 },
    ])
    expect(window.on(PUSH.historyChanged).length).toBeGreaterThan(0)
  })

  it('logs a successful Snooze answer to reminder history', () => {
    const wired = build(null, { reminders: [water] })
    const window = wired.openWindow()
    elapse(30 * MINUTE)

    wired.invoke(IPC.snoozeReminder, 10 * MINUTE)

    // A snoozed step logs no quantity, but the line was written — the same
    // re-read cue as any other stretch landing in a log.
    expect(window.on(PUSH.historyChanged).length).toBeGreaterThan(0)
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
    const wired = build(null, { sports: settings })

    expect(wired.sportsRunStore.load()).toEqual({
      scheduled: true,
      nextFireAt: 60 * MINUTE,
    })
  })

  it('resumes a saved schedule instead of scheduling fresh', () => {
    now = 10 * MINUTE
    const wired = build(null, {
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
    const wired = build(null, {
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
    const wired = build(null, { sports: settings })
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
    const wired = build(null, { sports: { ...settings, enabled: false } })

    expect(wired.menubar.clickMenuItem('Start Sports')).toBe(true)

    expect(wired.sportsStore.get().enabled).toBe(true)
    expect(wired.sportsService.getState()).toEqual({
      scheduled: true,
      nextFireAt: 60 * MINUTE,
    })
  })

  it('starts the next interval from the answer, not from the boundary', () => {
    const wired = build(null, { sports: settings })
    elapse(60 * MINUTE)
    elapse(5 * MINUTE)

    wired.invoke(IPC.confirmSports, { situps: 10, squats: 5 })

    expect(wired.sportsService.getState()).toEqual({
      scheduled: true,
      nextFireAt: 125 * MINUTE,
    })
  })

  it('drops the schedule when Sports is disabled', () => {
    const wired = build(null, { sports: settings })

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
    const wired = build(null, { sports: { ...settings, enabled: false } })
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
    const wired = build(null, { sports: settings })

    elapse(60 * MINUTE)

    expect(wired.sportsAlerts.notify).toHaveBeenCalledOnce()
    expect(wired.sportsAlerts.showOverlay).toHaveBeenCalledWith({
      activities: settings.activities,
    })
  })

  it('reschedules by extraMs on snooze', () => {
    const wired = build(null, { sports: settings })
    elapse(60 * MINUTE)

    expect(wired.invoke(IPC.snoozeSports, 10 * MINUTE)).toBe(true)

    expect(wired.sportsOverlay.close).toHaveBeenCalledOnce()
    expect(wired.sportsService.getState()).toEqual({
      scheduled: true,
      nextFireAt: 70 * MINUTE,
    })
  })

  it('closes the overlay and lets the engine advance on Done', () => {
    const wired = build(null, { sports: settings })
    elapse(60 * MINUTE)

    wired.invoke(IPC.confirmSports, { situps: 10, squats: 5 })

    expect(wired.sportsOverlay.close).toHaveBeenCalledOnce()
  })

  it('logs a Done answer to Sports history, one line per activity, and tells every open window', () => {
    const wired = build(null, { sports: settings })
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
    const wired = build(null, { sports: settings })

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
