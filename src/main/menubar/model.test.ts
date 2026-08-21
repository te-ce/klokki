import { describe, expect, it } from 'vitest'
import type { Preset } from '../../shared/preset'
import type { ReminderView } from '../../shared/reminder'
import {
  awaitingView,
  IDLE_VIEW,
  runningView,
} from '../../shared/test-support/timer-view'
import type { TimerView } from '../../shared/timer'
import { menuKey, menubarModel } from './model'

const pomodoro: Preset = {
  id: 'pomodoro',
  name: 'Pomodoro',
  loop: true,
  phases: [{ label: 'Focus', minutes: 25, notify: true }],
}

const sitStand: Preset = {
  id: 'sit-stand',
  name: 'Sit / stand',
  loop: true,
  phases: [{ label: 'Sitting', minutes: 30, notify: true }],
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

const IDLE = IDLE_VIEW

const running = (countdown: string, phaseLabel = 'Focus'): TimerView =>
  runningView({ countdown, phaseLabel, remainingMs: 60_000 })

const labels = (
  view: TimerView,
  presets: readonly Preset[],
  reminders: readonly ReminderView[] = [],
): string[] =>
  menubarModel(view, presets, reminders).items.map((item) =>
    item.kind === 'separator' ? '—' : item.label,
  )

describe('what the menubar says', () => {
  it('shows no title when nothing is running', () => {
    expect(menubarModel(IDLE, [pomodoro], []).title).toBe('')
    expect(menubarModel(IDLE, [pomodoro], []).tooltip).toBe('Klokki')
  })

  it('carries the phase and the countdown as the title, because an arc is illegible at 22px', () => {
    expect(menubarModel(running('24:59'), [pomodoro], []).title).toBe(
      ' Focus 24:59',
    )
    expect(menubarModel(running('24:59'), [pomodoro], []).tooltip).toBe(
      'Klokki — Focus',
    )
  })

  it('offers every preset, and nothing else, when idle', () => {
    expect(labels(IDLE, [pomodoro, sitStand])).toEqual([
      'Start Pomodoro',
      'Start Sit / stand',
      '—',
      'Settings…',
      'Quit Klokki',
    ])
  })

  it('names the running phase and offers Stop while running', () => {
    expect(labels(running('24:59'), [pomodoro])).toEqual([
      'Pomodoro — Focus',
      'Skip to Break',
      '+5 min',
      'Stop',
      '—',
      'Restart Pomodoro',
      '—',
      'Settings…',
      'Quit Klokki',
    ])
  })

  it('names the skip by the phase it starts, and by the end when nothing follows', () => {
    expect(labels(running('24:59'), [pomodoro])).toContain('Skip to Break')
    expect(
      labels({ ...running('00:30'), nextPhaseLabel: null }, [pomodoro]),
    ).toContain('Skip to the end')
  })

  it('still opens settings and quits with no presets at all', () => {
    expect(labels(IDLE, [])).toEqual(['—', 'Settings…', 'Quit Klokki'])
  })

  it('starts by id, so the tray and the window take the same path', () => {
    const items = menubarModel(IDLE, [pomodoro], []).items
    expect(items[0]).toEqual({
      kind: 'command',
      label: 'Start Pomodoro',
      action: { kind: 'start', presetId: 'pomodoro' },
    })
  })

  it('marks the running header as not clickable', () => {
    expect(menubarModel(running('24:59'), [pomodoro], []).items[0]).toEqual({
      kind: 'label',
      label: 'Pomodoro — Focus',
    })
  })

  it('says what a waiting run is waiting for, instead of a frozen countdown', () => {
    const waiting = awaitingView({ countdown: '05:00' })

    expect(menubarModel(waiting, [pomodoro], []).title).toBe(' Break ready')
    expect(labels(waiting, [pomodoro])).toEqual([
      'Pomodoro — Break ready',
      // Not "Skip to Focus": Break has not started, so starting it is the
      // whole of what the boundary is asking.
      'Start Break',
      '+5 min',
      'Stop',
      '—',
      'Restart Pomodoro',
      '—',
      'Settings…',
      'Quit Klokki',
    ])
  })

  it('confirms the boundary from the tray, so the overlay is not the only way out', () => {
    const items = menubarModel(awaitingView(), [pomodoro], []).items

    expect(items[1]).toEqual({
      kind: 'command',
      label: 'Start Break',
      action: { kind: 'confirm' },
    })
  })

  it('offers every reminder under a heading of its own', () => {
    expect(labels(IDLE, [pomodoro], [water])).toEqual([
      'Start Pomodoro',
      '—',
      'Reminders',
      'Start Drink water',
      '—',
      'Settings…',
      'Quit Klokki',
    ])
  })

  it('offers to restart a reminder that is already scheduled', () => {
    const scheduled = { ...water, nextFireAt: 1_700_000_000_000 }

    expect(labels(IDLE, [], [scheduled])).toContain('Restart Drink water')
  })

  it('starts a reminder by id, the same as a preset', () => {
    const items = menubarModel(IDLE, [], [water]).items

    expect(items[2]).toEqual({
      kind: 'command',
      label: 'Start Drink water',
      action: { kind: 'startReminder', reminderId: 'water' },
    })
  })

  it('says nothing about reminders when there are none', () => {
    expect(labels(IDLE, [pomodoro], [])).not.toContain('Reminders')
  })

  it('matches its snapshot while running', () => {
    expect(
      menubarModel(running('24:59'), [pomodoro, sitStand], [water]),
    ).toMatchSnapshot()
  })
})

describe('when the menu has to be rebuilt', () => {
  it('is unchanged by a countdown ticking, which happens every second', () => {
    const before = menuKey(menubarModel(running('24:59'), [pomodoro], []))
    const after = menuKey(menubarModel(running('24:58'), [pomodoro], []))

    expect(after).toBe(before)
  })

  it('changes when the phase does', () => {
    const focus = menuKey(
      menubarModel(running('01:00', 'Focus'), [pomodoro], []),
    )
    const brk = menuKey(menubarModel(running('01:00', 'Break'), [pomodoro], []))

    expect(brk).not.toBe(focus)
  })

  it('changes when a preset is renamed, so an edit shows up without a relaunch', () => {
    const before = menuKey(menubarModel(IDLE, [pomodoro], []))
    const after = menuKey(
      menubarModel(IDLE, [{ ...pomodoro, name: 'Deep work' }], []),
    )

    expect(after).not.toBe(before)
  })

  it('changes when a reminder fires, because Start becomes Restart', () => {
    const before = menuKey(menubarModel(IDLE, [], [water]))
    const after = menuKey(
      menubarModel(IDLE, [], [{ ...water, nextFireAt: 1_700_000_000_000 }]),
    )

    expect(after).not.toBe(before)
  })

  it('changes when a run starts waiting at a boundary', () => {
    expect(menuKey(menubarModel(awaitingView(), [pomodoro], []))).not.toBe(
      menuKey(menubarModel(runningView(), [pomodoro], [])),
    )
  })

  it('changes when the timer stops', () => {
    expect(menuKey(menubarModel(IDLE, [pomodoro], []))).not.toBe(
      menuKey(menubarModel(running('01:00'), [pomodoro], [])),
    )
  })
})
