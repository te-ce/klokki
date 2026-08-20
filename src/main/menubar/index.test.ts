import { describe, expect, it, vi } from 'vitest'
import type { Preset } from '../../shared/preset'
import { IDLE_VIEW, runningView } from '../../shared/test-support/timer-view'
import type { TimerView } from '../../shared/timer'
import { createMenubar } from './index'
import type { MenubarAction, MenubarItem, MenubarSurface } from './surface'

const pomodoro: Preset = {
  id: 'pomodoro',
  name: 'Pomodoro',
  loop: true,
  phases: [{ label: 'Focus', minutes: 25, notify: true }],
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

/** A timer and a store, driven by hand rather than by a clock. */
const fakeSources = (
  view: TimerView,
  presets: readonly Preset[] = [pomodoro],
) => {
  const timerListeners = new Set<(update: { view: TimerView }) => void>()
  const presetListeners = new Set<() => void>()
  let current = view
  let list = presets

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
    },
    pushView: (next: TimerView) => {
      current = next
      for (const listener of timerListeners) listener({ view: next })
    },
    savePresets: (next: readonly Preset[]) => {
      list = next
      for (const listener of presetListeners) listener()
    },
    timerListenerCount: () => timerListeners.size,
    presetListenerCount: () => presetListeners.size,
  }
}

const fakeActions = () => ({
  stop: vi.fn(),
  start: vi.fn(),
  skip: vi.fn(),
  openSettings: vi.fn(),
  quit: vi.fn(),
})

describe('the menubar', () => {
  it('shows the current state before the first update arrives', () => {
    const surface = fakeSurface()
    const { sources } = fakeSources(running('24:59'))

    createMenubar(surface, sources, fakeActions())

    expect(surface.title()).toBe(' Focus 24:59')
    expect(surface.menuLabels()).toContain('Stop')
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

    surface.clickMenuItem('Stop')
    surface.clickMenuItem('Settings…')
    surface.clickMenuItem('Quit Klokki')

    expect(actions.stop).toHaveBeenCalledOnce()
    expect(actions.openSettings).toHaveBeenCalledOnce()
    expect(actions.quit).toHaveBeenCalledOnce()
  })

  it('skips to the next phase, named by what it starts', () => {
    const surface = fakeSurface()
    const { sources } = fakeSources(running('24:59'))
    const actions = fakeActions()
    createMenubar(surface, sources, actions)

    expect(surface.clickMenuItem('Skip to Break')).toBe(true)

    expect(actions.skip).toHaveBeenCalledOnce()
  })

  it('offers nothing to skip while idle', () => {
    const surface = fakeSurface()
    const { sources } = fakeSources(IDLE)
    createMenubar(surface, sources, fakeActions())

    expect(surface.menuLabels()).not.toContain('Skip to Break')
  })

  it('cannot be clicked into the running header', () => {
    const surface = fakeSurface()
    const { sources } = fakeSources(running('24:59'))
    createMenubar(surface, sources, fakeActions())

    expect(surface.clickMenuItem('Pomodoro — Focus')).toBe(false)
  })

  it('lets go of both subscriptions when disposed', () => {
    const surface = fakeSurface()
    const sources = fakeSources(IDLE)
    const menubar = createMenubar(surface, sources.sources, fakeActions())

    menubar.dispose()

    expect(sources.timerListenerCount()).toBe(0)
    expect(sources.presetListenerCount()).toBe(0)
  })
})
