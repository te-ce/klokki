import { describe, expect, it, vi } from 'vitest'
import type { Preset } from '../../shared/preset'
import type { ReminderView } from '../../shared/reminder'
import type { SportsView } from '../../shared/sport'
import {
  awaitingView,
  IDLE_VIEW,
  runningView,
} from '../../shared/test-support/timer-view'
import type { TimerView } from '../../shared/timer'
import { createMenubar } from './index'
import type { MenubarAction, MenubarItem, MenubarSurface } from './surface'

const pomodoro: Preset = {
  id: 'pomodoro',
  name: 'Pomodoro',
  loop: true,
  phases: [{ label: 'Focus', minutes: 25, notify: true }],
}

const water: ReminderView = {
  id: 'water',
  name: 'Drink water',
  intervalMinutes: 30,
  steps: [{ label: 'Drink a glass' }],
  enabled: true,
  nextFireAt: null,
  awaiting: false,
}

const NO_SPORTS: SportsView = {
  intervalMinutes: 0,
  activities: [],
  enabled: false,
  nextFireAt: null,
  awaiting: false,
  remainingMs: null,
  countdown: null,
}

const sports: SportsView = {
  intervalMinutes: 60,
  activities: [{ id: 'situps', name: 'Situps' }],
  enabled: true,
  nextFireAt: null,
  awaiting: false,
  remainingMs: null,
  countdown: null,
}

const IDLE = IDLE_VIEW

const running = (countdown: string, phaseLabel = 'Focus'): TimerView =>
  runningView({ countdown, phaseLabel, remainingMs: 60_000 })

/**
 * Stands in for the menubar. The real one is a `Tray`, which no test can build:
 * this records what was applied to it and replays a click the same way macOS
 * would (see src/main/menubar/surface.ts).
 */
const fakeSurface = () => {
  let items: readonly MenubarItem[] = []
  let onAction: (action: MenubarAction) => void = () => {}
  let title = ''

  const surface: MenubarSurface & { menus: number } = {
    menus: 0,
    setTitle: (next) => {
      title = next
    },
    setToolTip: vi.fn(),
    setMenu: (nextItems, handler) => {
      items = nextItems
      onAction = handler
      surface.menus += 1
    },
    title: () => title,
    menuLabels: () =>
      items.map((item) => (item.kind === 'separator' ? '' : item.label)),
    clickMenuItem: (label) => {
      const item = items.find(
        (candidate) =>
          candidate.kind === 'command' && candidate.label === label,
      )
      if (item?.kind !== 'command') return false
      onAction(item.action)
      return true
    },
  }
  return surface
}

/** A timer, a store and a reminder list, driven by hand rather than by a clock. */
const fakeSources = (
  view: TimerView,
  presets: readonly Preset[] = [pomodoro],
  reminders: readonly ReminderView[] = [],
  sportsView: SportsView = NO_SPORTS,
) => {
  const timerListeners = new Set<(update: { view: TimerView }) => void>()
  const presetListeners = new Set<() => void>()
  const reminderListeners = new Set<() => void>()
  const sportsListeners = new Set<() => void>()
  let current = view
  let list = presets
  let reminderList = reminders
  let sportsCurrent = sportsView

  return {
    sources: {
      timer: {
        getView: () => current,
        subscribe: (listener: (update: { view: TimerView }) => void) => {
          timerListeners.add(listener)
          return () => timerListeners.delete(listener)
        },
      },
      presets: {
        list: () => list,
        subscribe: (listener: () => void) => {
          presetListeners.add(listener)
          return () => presetListeners.delete(listener)
        },
      },
      reminders: {
        views: () => reminderList,
        subscribe: (listener: () => void) => {
          reminderListeners.add(listener)
          return () => reminderListeners.delete(listener)
        },
      },
      sports: {
        view: () => sportsCurrent,
        subscribe: (listener: () => void) => {
          sportsListeners.add(listener)
          return () => sportsListeners.delete(listener)
        },
      },
    },
    pushView: (next: TimerView) => {
      current = next
      for (const listener of timerListeners) listener({ view: next })
    },
    savePresets: (next: readonly Preset[]) => {
      list = next
      for (const listener of presetListeners) listener()
    },
    pushReminders: (next: readonly ReminderView[]) => {
      reminderList = next
      for (const listener of reminderListeners) listener()
    },
    pushSports: (next: SportsView) => {
      sportsCurrent = next
      for (const listener of sportsListeners) listener()
    },
    timerListenerCount: () => timerListeners.size,
    presetListenerCount: () => presetListeners.size,
    reminderListenerCount: () => reminderListeners.size,
    sportsListenerCount: () => sportsListeners.size,
  }
}

const fakeActions = () => ({
  stop: vi.fn(),
  start: vi.fn(),
  startReminder: vi.fn(),
  stopReminder: vi.fn(),
  startSports: vi.fn(),
  stopSports: vi.fn(),
  fireSportsNow: vi.fn(),
  skip: vi.fn(),
  confirm: vi.fn(),
  addTime: vi.fn(),
  openSettings: vi.fn(),
  quit: vi.fn(),
})

describe('the menubar', () => {
  it('shows the current state before the first update arrives', () => {
    const surface = fakeSurface()
    const { sources } = fakeSources(running('24:59'))

    createMenubar(surface, sources, fakeActions())

    expect(surface.title()).toBe(' Focus 24:59')
    expect(surface.menuLabels()).toContain('Stop · Pomodoro')
  })

  it('follows the countdown', () => {
    const surface = fakeSurface()
    const { sources, pushView } = fakeSources(running('24:59'))
    createMenubar(surface, sources, fakeActions())

    pushView(running('24:58'))

    expect(surface.title()).toBe(' Focus 24:58')
  })

  it('does not rebuild the menu every second, which would close it mid-click', () => {
    const surface = fakeSurface()
    const { sources, pushView } = fakeSources(running('24:59'))
    createMenubar(surface, sources, fakeActions())
    const built = surface.menus

    pushView(running('24:58'))
    pushView(running('24:57'))

    expect(surface.menus).toBe(built)
  })

  it('rebuilds it when the phase changes', () => {
    const surface = fakeSurface()
    const { sources, pushView } = fakeSources(running('24:59', 'Focus'))
    createMenubar(surface, sources, fakeActions())
    const built = surface.menus

    pushView(running('05:00', 'Break'))

    expect(surface.menus).toBe(built + 1)
    expect(surface.menuLabels()).toContain('Pomodoro — Break')
  })

  it('picks up an edited preset without a relaunch', () => {
    const surface = fakeSurface()
    const { sources, savePresets } = fakeSources(IDLE)
    createMenubar(surface, sources, fakeActions())

    savePresets([{ ...pomodoro, name: 'Deep work' }])

    expect(surface.menuLabels()).toContain('Start Deep work')
  })

  it('starts a preset by id when its item is clicked', () => {
    const surface = fakeSurface()
    const { sources } = fakeSources(IDLE)
    const actions = fakeActions()
    createMenubar(surface, sources, actions)

    expect(surface.clickMenuItem('Start Pomodoro')).toBe(true)

    expect(actions.start).toHaveBeenCalledWith('pomodoro')
  })

  it('stops, opens settings and quits from the menu', () => {
    const surface = fakeSurface()
    const { sources } = fakeSources(running('24:59'))
    const actions = fakeActions()
    createMenubar(surface, sources, actions)

    surface.clickMenuItem('Stop · Pomodoro')
    surface.clickMenuItem('Settings…')
    surface.clickMenuItem('Quit Klokki')

    expect(actions.stop).toHaveBeenCalledExactlyOnceWith('pomodoro')
    expect(actions.openSettings).toHaveBeenCalledOnce()
    expect(actions.quit).toHaveBeenCalledOnce()
  })

  it('skips to the next phase, named by what it starts', () => {
    const surface = fakeSurface()
    const { sources } = fakeSources(running('24:59'))
    const actions = fakeActions()
    createMenubar(surface, sources, actions)

    expect(surface.clickMenuItem('Skip to Break · Pomodoro')).toBe(true)

    expect(actions.skip).toHaveBeenCalledExactlyOnceWith('pomodoro')
  })

  it('offers nothing to skip while idle', () => {
    const surface = fakeSurface()
    const { sources } = fakeSources(IDLE)
    createMenubar(surface, sources, fakeActions())

    expect(surface.menuLabels()).not.toContain('Skip to Break')
  })

  it('adds five minutes from the menu', () => {
    const surface = fakeSurface()
    const { sources } = fakeSources(running('24:59'))
    const actions = fakeActions()
    createMenubar(surface, sources, actions)

    expect(surface.clickMenuItem('+5 min · Pomodoro')).toBe(true)

    expect(actions.addTime).toHaveBeenCalledExactlyOnceWith('pomodoro')
  })

  it('offers nothing to add time to while idle', () => {
    const surface = fakeSurface()
    const { sources } = fakeSources(IDLE)
    createMenubar(surface, sources, fakeActions())

    expect(surface.menuLabels()).not.toContain('+5 min')
  })

  it('cannot be clicked into the running header', () => {
    const surface = fakeSurface()
    const { sources } = fakeSources(running('24:59'))
    createMenubar(surface, sources, fakeActions())

    expect(surface.clickMenuItem('Pomodoro — Focus')).toBe(false)
  })

  it('starts a reminder by id when its item is clicked', () => {
    const surface = fakeSurface()
    const { sources } = fakeSources(IDLE, [pomodoro], [water])
    const actions = fakeActions()
    createMenubar(surface, sources, actions)

    expect(surface.clickMenuItem('Start Drink water')).toBe(true)

    expect(actions.startReminder).toHaveBeenCalledWith('water')
  })

  it('stops a reminder by id when its item is clicked', () => {
    const surface = fakeSurface()
    const { sources } = fakeSources(IDLE, [pomodoro], [water])
    const actions = fakeActions()
    createMenubar(surface, sources, actions)

    expect(surface.clickMenuItem('Stop Drink water')).toBe(true)

    expect(actions.stopReminder).toHaveBeenCalledWith('water')
  })

  it('picks up a reminder created or fired without a relaunch', () => {
    const surface = fakeSurface()
    const { sources, pushReminders } = fakeSources(IDLE)
    createMenubar(surface, sources, fakeActions())

    pushReminders([water])
    expect(surface.menuLabels()).toContain('Start Drink water')

    pushReminders([{ ...water, nextFireAt: 1_700_000_000_000 }])
    expect(surface.menuLabels()).toContain('Restart Drink water')
  })

  it('confirms a waiting boundary from the menu', () => {
    const surface = fakeSurface()
    const { sources, pushView } = fakeSources(running('24:59'))
    const actions = fakeActions()
    createMenubar(surface, sources, actions)

    pushView(awaitingView())

    expect(surface.clickMenuItem('Start Break · Pomodoro')).toBe(true)
    expect(actions.confirm).toHaveBeenCalledExactlyOnceWith('pomodoro')
    expect(actions.skip).not.toHaveBeenCalled()
  })

  it('lets go of every subscription when disposed', () => {
    const surface = fakeSurface()
    const sources = fakeSources(IDLE)
    const menubar = createMenubar(surface, sources.sources, fakeActions())

    menubar.dispose()

    expect(sources.timerListenerCount()).toBe(0)
    expect(sources.presetListenerCount()).toBe(0)
    expect(sources.reminderListenerCount()).toBe(0)
    expect(sources.sportsListenerCount()).toBe(0)
  })

  it('starts Sports when its item is clicked', () => {
    const surface = fakeSurface()
    const { sources } = fakeSources(IDLE, [pomodoro], [], sports)
    const actions = fakeActions()
    createMenubar(surface, sources, actions)

    expect(surface.clickMenuItem('Start Sports')).toBe(true)

    expect(actions.startSports).toHaveBeenCalledOnce()
  })

  it('stops Sports when its item is clicked', () => {
    const surface = fakeSurface()
    const { sources } = fakeSources(IDLE, [pomodoro], [], sports)
    const actions = fakeActions()
    createMenubar(surface, sources, actions)

    expect(surface.clickMenuItem('Stop Sports')).toBe(true)

    expect(actions.stopSports).toHaveBeenCalledOnce()
  })

  it('picks up Sports firing without a relaunch', () => {
    const surface = fakeSurface()
    const { sources, pushSports } = fakeSources(IDLE, [pomodoro], [], sports)
    createMenubar(surface, sources, fakeActions())

    pushSports({ ...sports, nextFireAt: 1_700_000_000_000 })

    expect(surface.menuLabels()).toContain('Restart Sports')
  })
})
