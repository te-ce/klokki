import { describe, expect, it } from 'vitest'
import type { Preset } from '../../shared/preset'
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

const IDLE: TimerView = {
  running: false,
  presetName: null,
  phaseLabel: null,
  nextPhaseLabel: null,
  remainingMs: 0,
  countdown: '00:00',
}

const running = (countdown: string, phaseLabel = 'Focus'): TimerView => ({
  running: true,
  presetName: 'Pomodoro',
  phaseLabel,
  nextPhaseLabel: 'Break',
  remainingMs: 60_000,
  countdown,
})

const labels = (view: TimerView, presets: readonly Preset[]): string[] =>
  menubarModel(view, presets).items.map((item) =>
    item.kind === 'separator' ? '—' : item.label,
  )

describe('what the menubar says', () => {
  it('shows no title when nothing is running', () => {
    expect(menubarModel(IDLE, [pomodoro]).title).toBe('')
    expect(menubarModel(IDLE, [pomodoro]).tooltip).toBe('Klokki')
  })

  it('carries the phase and the countdown as the title, because an arc is illegible at 22px', () => {
    expect(menubarModel(running('24:59'), [pomodoro]).title).toBe(
      ' Focus 24:59',
    )
    expect(menubarModel(running('24:59'), [pomodoro]).tooltip).toBe(
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
    const items = menubarModel(IDLE, [pomodoro]).items
    expect(items[0]).toEqual({
      kind: 'command',
      label: 'Start Pomodoro',
      action: { kind: 'start', presetId: 'pomodoro' },
    })
  })

  it('marks the running header as not clickable', () => {
    expect(menubarModel(running('24:59'), [pomodoro]).items[0]).toEqual({
      kind: 'label',
      label: 'Pomodoro — Focus',
    })
  })

  it('matches its snapshot while running', () => {
    expect(
      menubarModel(running('24:59'), [pomodoro, sitStand]),
    ).toMatchSnapshot()
  })
})

describe('when the menu has to be rebuilt', () => {
  it('is unchanged by a countdown ticking, which happens every second', () => {
    const before = menuKey(menubarModel(running('24:59'), [pomodoro]))
    const after = menuKey(menubarModel(running('24:58'), [pomodoro]))

    expect(after).toBe(before)
  })

  it('changes when the phase does', () => {
    const focus = menuKey(menubarModel(running('01:00', 'Focus'), [pomodoro]))
    const brk = menuKey(menubarModel(running('01:00', 'Break'), [pomodoro]))

    expect(brk).not.toBe(focus)
  })

  it('changes when a preset is renamed, so an edit shows up without a relaunch', () => {
    const before = menuKey(menubarModel(IDLE, [pomodoro]))
    const after = menuKey(
      menubarModel(IDLE, [{ ...pomodoro, name: 'Deep work' }]),
    )

    expect(after).not.toBe(before)
  })

  it('changes when the timer stops', () => {
    expect(menuKey(menubarModel(IDLE, [pomodoro]))).not.toBe(
      menuKey(menubarModel(running('01:00'), [pomodoro])),
    )
  })
})
