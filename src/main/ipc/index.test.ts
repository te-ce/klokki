import { describe, expect, it, vi } from 'vitest'
import { IPC, PUSH } from '../../shared/ipc'
import type { Preset } from '../../shared/preset'
import type { ReminderDefinition, ReminderView } from '../../shared/reminder'
import type { SportSettings, SportsView } from '../../shared/sport'
import { IDLE_VIEW } from '../../shared/test-support/timer-view'
import { registerIpc, type IpcDeps, type RequestSink } from './index'

const pomodoro: Preset = {
  id: 'pomodoro',
  name: 'Pomodoro',
  loop: true,
  phases: [{ label: 'Focus', minutes: 25, notify: true }],
}

const water: ReminderDefinition = {
  id: 'water',
  name: 'Drink water',
  intervalMinutes: 30,
  steps: [{ label: 'Drink a glass of water' }],
  enabled: true,
}

const waterView: ReminderView = {
  ...water,
  nextFireAt: 1_800_000,
  awaiting: false,
}

const sportsSettings: SportSettings = {
  intervalMinutes: 60,
  activities: [{ id: 'situps', name: 'Situps' }],
  enabled: true,
}

const sportsView: SportsView = {
  ...sportsSettings,
  nextFireAt: 3_600_000,
  awaiting: false,
  remainingMs: 3_600_000,
  countdown: '1:00:00',
}

const IDLE = IDLE_VIEW

/** Stands in for ipcMain: keeps the handlers so a test can call one. */
const fakeSink = () => {
  const handlers = new Map<string, (...args: readonly unknown[]) => unknown>()
  return {
    sink: {
      handle: (channel, handler) => {
        handlers.set(channel, handler)
      },
    } satisfies RequestSink,
    channels: () => [...handlers.keys()],
    invoke: (channel: string, ...args: readonly unknown[]) => {
      const handler = handlers.get(channel)
      if (!handler) throw new Error(`nothing answers "${channel}"`)
      return handler(...args)
    },
  }
}

const wire = (overrides: Partial<IpcDeps> = {}) => {
  const sink = fakeSink()
  const service = {
    startPreset: vi.fn(),
    stop: vi.fn(),
    snooze: vi.fn(() => true),
    skip: vi.fn(() => true),
    confirm: vi.fn(() => true),
    setRemaining: vi.fn(() => true),
    addTime: vi.fn(() => true),
    getView: vi.fn(() => IDLE),
    getState: vi.fn(() => ({ status: 'idle' }) as const),
    resume: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    dispose: vi.fn(),
  }
  const store = {
    list: vi.fn((): readonly Preset[] => [pomodoro]),
    save: vi.fn(() => ({ ok: true }) as const),
    remove: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  }
  const loginItem = {
    isEnabled: vi.fn(() => false),
    setEnabled: vi.fn(() => true),
  }
  const history = {
    append: vi.fn(),
    stats: vi.fn(() => ({
      today: { date: '2026-08-20', completed: 0, minutesByLabel: [] },
      days: [],
    })),
    subscribe: vi.fn(() => () => {}),
  }
  const reminderHistory = {
    append: vi.fn(),
    stats: vi.fn(() => ({
      today: { date: '2026-08-20', quantityByLabel: [] },
      days: [],
    })),
    subscribe: vi.fn(() => () => {}),
  }
  const overlay = { close: vi.fn() }
  const reminderAnswers = {
    snooze: vi.fn(() => true),
    complete: vi.fn(),
    stop: vi.fn(),
  }
  const reminderStore = {
    list: vi.fn((): readonly ReminderDefinition[] => [water]),
    save: vi.fn(() => ({ ok: true }) as const),
    remove: vi.fn(),
    setEnabled: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  }
  const reminderViews = vi.fn((): readonly ReminderView[] => [waterView])
  const sportsHistory = {
    append: vi.fn(),
    stats: vi.fn(() => ({
      today: { date: '2026-08-20', quantityByLabel: [] },
      days: [],
    })),
    subscribe: vi.fn(() => () => {}),
  }
  const sportsStore = {
    get: vi.fn((): SportSettings => sportsSettings),
    save: vi.fn(() => ({ ok: true }) as const),
    subscribe: vi.fn(() => () => {}),
  }
  const sportsViews = vi.fn((): SportsView => sportsView)
  const sportsAnswers = {
    snooze: vi.fn(() => true),
    confirm: vi.fn(),
    stop: vi.fn(),
  }
  const sportsService = {
    setSettings: vi.fn(),
    resume: vi.fn(),
    snooze: vi.fn(() => true),
    confirm: vi.fn(() => true),
    setRemaining: vi.fn(() => true),
    addTime: vi.fn(() => true),
    start: vi.fn(() => true),
    fireNow: vi.fn(() => true),
    getState: vi.fn(() => ({ scheduled: false, nextFireAt: null }) as const),
    subscribe: vi.fn(() => () => {}),
    onScheduleChange: vi.fn(() => () => {}),
    dispose: vi.fn(),
  }
  const startSports = vi.fn()
  const stopSports = vi.fn()
  const stopFromAlert = vi.fn()
  const logSports = vi.fn()
  const deps: IpcDeps = {
    requests: sink.sink,
    service,
    store,
    loginItem,
    history,
    reminderHistory,
    overlay,
    reminderStore,
    reminderViews,
    reminderAnswers,
    sportsHistory,
    sportsStore,
    sportsViews,
    sportsAnswers,
    sportsService,
    startSports,
    stopSports,
    stopFromAlert,
    logSports,
    appInfo: () => ({ version: '1.2.3', electron: '43.0.0' }),
    ...overrides,
  }

  registerIpc(deps)
  return {
    ...sink,
    service,
    store,
    loginItem,
    history,
    reminderHistory,
    overlay,
    reminderStore,
    reminderViews,
    reminderAnswers,
    sportsHistory,
    sportsStore,
    sportsViews,
    sportsAnswers,
    sportsService,
    startSports,
    stopSports,
    stopFromAlert,
    logSports,
  }
}

describe('the request contract', () => {
  it('answers on every channel the renderer can call', () => {
    const app = wire()

    expect(app.channels().sort()).toEqual(Object.values(IPC).sort())
  })

  it('never answers on a channel main is supposed to push', () => {
    const app = wire()

    for (const channel of Object.values(PUSH))
      expect(app.channels()).not.toContain(channel)
  })
})

describe('what the handlers do', () => {
  it('reports the running app, not a build-time constant', () => {
    expect(wire().invoke(IPC.getAppInfo)).toEqual({
      version: '1.2.3',
      electron: '43.0.0',
    })
  })

  it('reads the preset list per call, so an edit is never answered stale', () => {
    const app = wire()

    app.invoke(IPC.listPresets)
    app.invoke(IPC.listPresets)

    expect(app.store.list).toHaveBeenCalledTimes(2)
  })

  it('starts a preset by id, from the list as it is now', () => {
    const app = wire()

    app.invoke(IPC.startPreset, 'pomodoro')

    expect(app.service.startPreset).toHaveBeenCalledWith(pomodoro)
  })

  it('does nothing for an id that has been deleted under an open window', () => {
    const app = wire()

    app.invoke(IPC.startPreset, 'gone')

    expect(app.service.startPreset).not.toHaveBeenCalled()
  })

  it('returns the reasons a preset was rejected rather than throwing', () => {
    const app = wire()
    app.store.save.mockReturnValue({
      ok: false,
      problems: ['A preset needs a name.'],
    } as never)

    expect(app.invoke(IPC.savePreset, pomodoro)).toEqual({
      ok: false,
      problems: ['A preset needs a name.'],
    })
  })

  it('starts the waiting phase and closes the overlay when the alert is dismissed', () => {
    const app = wire()

    app.invoke(IPC.dismissAlert)

    // Acknowledging the boundary is what starts the phase behind it: closing
    // the window without confirming would leave the run parked for good.
    expect(app.service.confirm).toHaveBeenCalledOnce()
    expect(app.overlay.close).toHaveBeenCalledOnce()
    expect(app.service.snooze).not.toHaveBeenCalled()
  })

  it('stops the run and the overlay together, from the alert itself', () => {
    const app = wire()

    app.invoke(IPC.stopFromAlert)

    // One closure in wire.ts, so the overlay's Stop and the notification's
    // cannot drift apart. `stopTimer` is untouched: this is the alert's own way
    // out, not a second way to stop the timer.
    expect(app.stopFromAlert).toHaveBeenCalledOnce()
    expect(app.service.confirm).not.toHaveBeenCalled()
  })

  it('confirms a waiting boundary for a window that is not the overlay', () => {
    const app = wire()

    expect(app.invoke(IPC.confirmNext)).toBe(true)

    expect(app.service.confirm).toHaveBeenCalledOnce()
    expect(app.overlay.close).not.toHaveBeenCalled()
  })

  it('defers the boundary and closes the overlay on a snooze', () => {
    const app = wire()

    expect(app.invoke(IPC.snoozeAlert, 600_000)).toBe(true)

    expect(app.service.snooze).toHaveBeenCalledWith(600_000)
    expect(app.overlay.close).toHaveBeenCalledOnce()
  })

  it('says so when the snooze was declined, and closes the overlay anyway', () => {
    const app = wire()
    // The user answered the overlay more than five minutes after the boundary,
    // so the deferred end has already gone by and the machine declines it.
    app.service.snooze.mockReturnValue(false)

    expect(app.invoke(IPC.snoozeAlert, 300_000)).toBe(false)

    expect(app.overlay.close).toHaveBeenCalledOnce()
  })

  it('reads the login item from the OS and reports what it says after a write', () => {
    const app = wire()

    expect(app.invoke(IPC.getLaunchAtLogin)).toBe(false)
    expect(app.invoke(IPC.setLaunchAtLogin, true)).toBe(true)

    expect(app.loginItem.setEnabled).toHaveBeenCalledWith(true)
  })

  it('answers a window that has just opened with the current view', () => {
    const app = wire()

    expect(app.invoke(IPC.getTimerView)).toEqual(IDLE)
  })

  it('stops the timer', () => {
    const app = wire()

    app.invoke(IPC.stopTimer)

    expect(app.service.stop).toHaveBeenCalledOnce()
  })

  it('skips to the next phase, and says whether anything moved', () => {
    const app = wire()

    expect(app.invoke(IPC.skipPhase)).toBe(true)
    expect(app.service.skip).toHaveBeenCalledOnce()
  })

  it('corrects the remaining time, and says whether anything moved', () => {
    const app = wire()

    expect(app.invoke(IPC.setRemaining, 120_000)).toBe(true)
    expect(app.service.setRemaining).toHaveBeenCalledWith(120_000)
  })

  it('adds time to the running phase, and says whether anything moved', () => {
    const app = wire()

    expect(app.invoke(IPC.addTime, 300_000)).toBe(true)
    expect(app.service.addTime).toHaveBeenCalledWith(300_000)
  })

  it('deletes a preset by id', () => {
    const app = wire()

    app.invoke(IPC.deletePreset, 'pomodoro')

    expect(app.store.remove).toHaveBeenCalledWith('pomodoro')
  })

  it('summarises the log per call, never from a cache', () => {
    const app = wire()

    app.invoke(IPC.getStats)
    app.invoke(IPC.getStats)

    expect(app.history.stats).toHaveBeenCalledTimes(2)
  })

  it('reads the reminder list per call, joined with its schedule', () => {
    const app = wire()

    expect(app.invoke(IPC.listReminders)).toEqual([waterView])
    expect(app.reminderViews).toHaveBeenCalledTimes(1)
  })

  it('saves a reminder, upserting by id', () => {
    const app = wire()

    expect(app.invoke(IPC.saveReminder, water)).toEqual({ ok: true })
    expect(app.reminderStore.save).toHaveBeenCalledWith(water)
  })

  it('returns the reasons a reminder was rejected rather than throwing', () => {
    const app = wire()
    app.reminderStore.save.mockReturnValue({
      ok: false,
      problems: ['A reminder needs a name.'],
    } as never)

    expect(app.invoke(IPC.saveReminder, water)).toEqual({
      ok: false,
      problems: ['A reminder needs a name.'],
    })
  })

  it('deletes a reminder by id', () => {
    const app = wire()

    app.invoke(IPC.deleteReminder, 'water')

    expect(app.reminderStore.remove).toHaveBeenCalledWith('water')
  })

  it('enables and disables a reminder by id', () => {
    const app = wire()

    app.invoke(IPC.setReminderEnabled, 'water', false)

    expect(app.reminderStore.setEnabled).toHaveBeenCalledWith('water', false)
  })

  it('defers the reminder currently showing, and says whether it moved', () => {
    const app = wire()

    expect(app.invoke(IPC.snoozeReminder, 600_000)).toBe(true)

    expect(app.reminderAnswers.snooze).toHaveBeenCalledWith(600_000)
  })

  it('stops the reminder currently showing, without being told which', () => {
    const app = wire()

    app.invoke(IPC.stopReminderFromAlert)

    expect(app.reminderAnswers.stop).toHaveBeenCalledOnce()
    expect(app.reminderAnswers.complete).not.toHaveBeenCalled()
  })

  it('answers the reminder currently showing as done, with its quantity', () => {
    const app = wire()

    app.invoke(IPC.completeReminder, 20)

    expect(app.reminderAnswers.complete).toHaveBeenCalledWith(20)
  })

  it('completes a unit-less reminder with a null quantity', () => {
    const app = wire()

    app.invoke(IPC.completeReminder, null)

    expect(app.reminderAnswers.complete).toHaveBeenCalledWith(null)
  })

  it('summarises the reminder log per call, never from a cache', () => {
    const app = wire()

    app.invoke(IPC.getReminderStats)
    app.invoke(IPC.getReminderStats)

    expect(app.reminderHistory.stats).toHaveBeenCalledTimes(2)
  })

  it('reads the Sports view per call, joined with its schedule', () => {
    const app = wire()

    expect(app.invoke(IPC.getSportsSettings)).toEqual(sportsView)
    expect(app.sportsViews).toHaveBeenCalledTimes(1)
  })

  it('saves Sports settings, upserting the one schedule', () => {
    const app = wire()

    expect(app.invoke(IPC.saveSportsSettings, sportsSettings)).toEqual({
      ok: true,
    })
    expect(app.sportsStore.save).toHaveBeenCalledWith(sportsSettings)
  })

  it('returns the reasons Sports settings were rejected rather than throwing', () => {
    const app = wire()
    app.sportsStore.save.mockReturnValue({
      ok: false,
      problems: ['Sports needs at least one activity.'],
    } as never)

    expect(app.invoke(IPC.saveSportsSettings, sportsSettings)).toEqual({
      ok: false,
      problems: ['Sports needs at least one activity.'],
    })
  })

  it('starts Sports from the tray', () => {
    const app = wire()

    app.invoke(IPC.startSports)

    expect(app.startSports).toHaveBeenCalledOnce()
  })

  it('stops Sports from the tray', () => {
    const app = wire()

    app.invoke(IPC.stopSports)

    expect(app.stopSports).toHaveBeenCalledOnce()
  })

  it('stops Sports from the overlay it raised', () => {
    const app = wire()

    app.invoke(IPC.stopSportsFromAlert)

    // Through the controller, which is what also closes the overlay and clears
    // the firing it was showing — not the tray's bare `stopSports`.
    expect(app.sportsAnswers.stop).toHaveBeenCalledOnce()
    expect(app.stopSports).not.toHaveBeenCalled()
  })

  it('defers Sports currently showing, and says whether it moved', () => {
    const app = wire()

    expect(app.invoke(IPC.snoozeSports, 600_000)).toBe(true)

    expect(app.sportsAnswers.snooze).toHaveBeenCalledWith(600_000)
  })

  it('answers Sports currently showing as done, with quantities per activity', () => {
    const app = wire()

    app.invoke(IPC.confirmSports, { situps: 20 })

    expect(app.sportsAnswers.confirm).toHaveBeenCalledWith({ situps: 20 })
  })

  it('logs Sports activity from the tab, independent of the overlay', () => {
    const app = wire()

    app.invoke(IPC.logSports, { situps: 15 })

    expect(app.logSports).toHaveBeenCalledWith({ situps: 15 })
  })

  it('summarises the Sports log per call, never from a cache', () => {
    const app = wire()

    app.invoke(IPC.getSportsStats)
    app.invoke(IPC.getSportsStats)

    expect(app.sportsHistory.stats).toHaveBeenCalledTimes(2)
  })

  it('corrects the Sports remaining time, and says whether anything moved', () => {
    const app = wire()

    expect(app.invoke(IPC.setRemainingSports, 120_000)).toBe(true)
    expect(app.sportsService.setRemaining).toHaveBeenCalledWith(120_000)
  })

  it('adds time to the running Sports countdown, and says whether anything moved', () => {
    const app = wire()

    expect(app.invoke(IPC.addTimeSports, 300_000)).toBe(true)
    expect(app.sportsService.addTime).toHaveBeenCalledWith(300_000)
  })
})
