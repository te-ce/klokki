import { describe, expect, it, vi } from 'vitest'
import { IPC, PUSH } from '../../shared/ipc'
import type { Preset } from '../../shared/preset'
import type { ReminderDefinition, ReminderView } from '../../shared/reminder'
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

const waterView: ReminderView = { ...water, nextFireAt: 1_800_000 }

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
  }
  const reminderStore = {
    list: vi.fn((): readonly ReminderDefinition[] => [water]),
    save: vi.fn(() => ({ ok: true }) as const),
    remove: vi.fn(),
    setEnabled: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  }
  const reminderViews = vi.fn((): readonly ReminderView[] => [waterView])
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

  it('closes the overlay when the alert is dismissed', () => {
    const app = wire()

    app.invoke(IPC.dismissAlert)

    expect(app.overlay.close).toHaveBeenCalledOnce()
    expect(app.service.snooze).not.toHaveBeenCalled()
  })

  it('defers the boundary and closes the overlay on a snooze', () => {
    const app = wire()

    expect(app.invoke(IPC.snoozeAlert)).toBe(true)

    expect(app.service.snooze).toHaveBeenCalledOnce()
    expect(app.overlay.close).toHaveBeenCalledOnce()
  })

  it('says so when the snooze was declined, and closes the overlay anyway', () => {
    const app = wire()
    // The user answered the overlay more than five minutes after the boundary,
    // so the deferred end has already gone by and the machine declines it.
    app.service.snooze.mockReturnValue(false)

    expect(app.invoke(IPC.snoozeAlert)).toBe(false)

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
})
