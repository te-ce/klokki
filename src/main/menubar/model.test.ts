import { describe, expect, it } from 'vitest'
import type { Preset } from '../../shared/preset'
import type { ReminderView } from '../../shared/reminder'
import type { SportsView } from '../../shared/sport'
import {
  awaitingRun,
  awaitingView,
  IDLE_VIEW,
  pomodoroRun,
  runningView,
  sitStandRun,
  twoRunView,
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

/** One run, with fields overridden — for a test that pokes at a single run. */
const oneRun = (overrides: Parameters<typeof pomodoroRun>[0]): TimerView => ({
  runs: [pomodoroRun(overrides)],
})

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
      // Every command names its run: two runs both offering a bare "Stop"
      // would be two identical items in one menu.
      'Skip to Break · Pomodoro',
      '+5 min · Pomodoro',
      'Stop · Pomodoro',
      '—',
      'Restart Pomodoro',
      '—',
      'Settings…',
      'Quit Klokki',
    ])
  })

  it('names the skip by the phase it starts, and by the end when nothing follows', () => {
    expect(labels(running('24:59'), [pomodoro])).toContain(
      'Skip to Break · Pomodoro',
    )
    expect(
      labels(oneRun({ countdown: '00:30', nextPhaseLabel: null }), [pomodoro]),
    ).toContain('Skip to the end · Pomodoro')
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

  it('stops, skips and extends by run id, because there may be several', () => {
    const items = menubarModel(runningView(), [pomodoro], []).items

    expect(items.slice(1, 4)).toEqual([
      {
        kind: 'command',
        label: 'Skip to Break · Pomodoro',
        action: { kind: 'skip', runId: 'pomodoro' },
      },
      {
        kind: 'command',
        label: '+5 min · Pomodoro',
        action: { kind: 'addTime', runId: 'pomodoro' },
      },
      {
        kind: 'command',
        label: 'Stop · Pomodoro',
        action: { kind: 'stop', runId: 'pomodoro' },
      },
    ])
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
      'Start Break · Pomodoro',
      '+5 min · Pomodoro',
      'Stop · Pomodoro',
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
      label: 'Start Break · Pomodoro',
      action: { kind: 'confirm', runId: 'pomodoro' },
    })
  })

  it('offers every reminder under a heading of its own, with Stop for one that is on', () => {
    expect(labels(IDLE, [pomodoro], [water])).toEqual([
      'Start Pomodoro',
      '—',
      'Reminders',
      'Start Drink water',
      'Stop Drink water',
      '—',
      'Settings…',
      'Quit Klokki',
    ])
  })

  it('offers to restart a reminder that is already scheduled', () => {
    const scheduled = { ...water, nextFireAt: 1_700_000_000_000 }

    expect(labels(IDLE, [], [scheduled])).toContain('Restart Drink water')
  })

  it('offers to stop a reminder that is on, and not one that is off', () => {
    expect(labels(IDLE, [], [water])).toContain('Stop Drink water')
    expect(labels(IDLE, [], [{ ...water, enabled: false }])).not.toContain(
      'Stop Drink water',
    )
  })

  it('starts a reminder by id, the same as a preset', () => {
    const items = menubarModel(IDLE, [], [water]).items

    expect(items[2]).toEqual({
      kind: 'command',
      label: 'Start Drink water',
      action: { kind: 'startReminder', reminderId: 'water' },
    })
  })

  it('stops a reminder by id, from the same row it started on', () => {
    const items = menubarModel(IDLE, [], [water]).items

    expect(items[3]).toEqual({
      kind: 'command',
      label: 'Stop Drink water',
      action: { kind: 'stopReminder', reminderId: 'water' },
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

  it('matches its snapshot with two presets running at once', () => {
    expect(
      menubarModel(twoRunView(), [pomodoro, sitStand], [water]),
    ).toMatchSnapshot()
  })

  it('offers a single Start/Restart Sports entry under its own heading', () => {
    expect(
      menubarModel(IDLE, [], [], sports).items.map((item) =>
        item.kind === 'separator' ? '—' : item.label,
      ),
    ).toEqual([
      '—',
      'Sports',
      'Start Sports',
      'Log Sports Now',
      'Stop Sports',
      '—',
      'Settings…',
      'Quit Klokki',
    ])
  })

  it('fires Sports right now by its own command', () => {
    const items = menubarModel(IDLE, [], [], sports).items
    expect(items[3]).toEqual({
      kind: 'command',
      label: 'Log Sports Now',
      action: { kind: 'fireSportsNow' },
    })
  })

  it('hides Log Sports Now while a firing is already awaiting an answer', () => {
    expect(
      menubarModel(IDLE, [], [], { ...sports, awaiting: true }).items.map(
        (item) => (item.kind === 'separator' ? '—' : item.label),
      ),
    ).not.toContain('Log Sports Now')
  })

  it('offers to start Sports that has not been scheduled yet', () => {
    const items = menubarModel(IDLE, [], [], sports).items
    expect(items[2]).toEqual({
      kind: 'command',
      label: 'Start Sports',
      action: { kind: 'startSports' },
    })
  })

  it('offers Restart once Sports is scheduled, Start otherwise', () => {
    const unscheduled = { ...sports, nextFireAt: null }
    expect(
      menubarModel(IDLE, [], [], unscheduled).items.map((item) =>
        item.kind === 'separator' ? '—' : item.label,
      ),
    ).toContain('Start Sports')

    const scheduled = { ...sports, nextFireAt: 1_700_000_000_000 }
    expect(
      menubarModel(IDLE, [], [], scheduled).items.map((item) =>
        item.kind === 'separator' ? '—' : item.label,
      ),
    ).toContain('Restart Sports')
  })

  it('offers to stop Sports only when it is on', () => {
    expect(
      menubarModel(IDLE, [], [], { ...sports, enabled: false }).items.map(
        (item) => (item.kind === 'separator' ? '—' : item.label),
      ),
    ).not.toContain('Stop Sports')
  })

  it('says nothing about Sports when there are no activities', () => {
    expect(
      menubarModel(IDLE, [], [], { ...sports, activities: [] }).items.map(
        (item) => (item.kind === 'separator' ? '—' : item.label),
      ),
    ).not.toContain('Sports')
  })
})

/**
 * The title concatenates every run rather than naming one and hiding the rest: a
 * timer the user started and cannot see is a timer they have stopped trusting,
 * and the menubar is the whole UI.
 */
describe('the title with several runs', () => {
  it('joins every run, in the order they were started', () => {
    expect(menubarModel(twoRunView(), [], []).title).toBe(
      ' Focus 25:00 · Sitting 30:00',
    )
  })

  it('keeps naming the phase, never only the number', () => {
    const title = menubarModel(twoRunView(), [], []).title
    expect(title).toContain('Focus')
    expect(title).toContain('Sitting')
  })

  it('says what a waiting run among live ones is waiting for', () => {
    expect(
      menubarModel({ runs: [awaitingRun(), sitStandRun()] }, [], []).title,
    ).toBe(' Break ready · Sitting 30:00')
  })

  // Nothing is elided here: a long title is elided by macOS from the right, and
  // the menu below carries a section per run, so nothing lives only in the title.
  it('grows with the runs rather than dropping any of them', () => {
    const runs = [
      pomodoroRun(),
      sitStandRun(),
      pomodoroRun({
        runId: 'third',
        presetName: 'Third',
        phaseLabel: 'Reading',
      }),
    ]

    expect(menubarModel({ runs }, [], []).title).toBe(
      ' Focus 25:00 · Sitting 30:00 · Reading 25:00',
    )
  })

  it('names every phase in the tooltip too', () => {
    expect(menubarModel(twoRunView(), [], []).tooltip).toBe(
      'Klokki — Focus · Sitting',
    )
  })

  it('is empty with no runs, exactly as it was with one timer', () => {
    expect(menubarModel(IDLE, [pomodoro], []).title).toBe('')
  })
})

describe('a section per running preset', () => {
  it('gives each run its own heading and its own three commands', () => {
    expect(labels(twoRunView(), [])).toEqual([
      'Pomodoro — Focus',
      'Skip to Break · Pomodoro',
      '+5 min · Pomodoro',
      'Stop · Pomodoro',
      '—',
      'Sit/Stand — Sitting',
      'Skip to Standing · Sit/Stand',
      '+5 min · Sit/Stand',
      'Stop · Sit/Stand',
      '—',
      '—',
      'Settings…',
      'Quit Klokki',
    ])
  })

  it('offers Restart for the presets that are running and Start for the rest', () => {
    expect(labels(runningView(), [pomodoro, sitStand])).toContain(
      'Restart Pomodoro',
    )
    // Sit / stand is not running: clicking it would add a run of its own.
    expect(labels(runningView(), [pomodoro, sitStand])).toContain(
      'Start Sit / stand',
    )
  })

  it('keeps the Reminders and Sports headings intact beneath the runs', () => {
    expect(
      menubarModel(twoRunView(), [pomodoro], [water], sports).items.map(
        (item) => (item.kind === 'separator' ? '—' : item.label),
      ),
    ).toEqual([
      'Pomodoro — Focus',
      'Skip to Break · Pomodoro',
      '+5 min · Pomodoro',
      'Stop · Pomodoro',
      '—',
      'Sit/Stand — Sitting',
      'Skip to Standing · Sit/Stand',
      '+5 min · Sit/Stand',
      'Stop · Sit/Stand',
      '—',
      'Restart Pomodoro',
      '—',
      'Reminders',
      'Start Drink water',
      'Stop Drink water',
      '—',
      'Sports',
      'Start Sports',
      'Log Sports Now',
      'Stop Sports',
      '—',
      'Settings…',
      'Quit Klokki',
    ])
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

  it('changes when a second preset starts, and not when either only ticks', () => {
    const one = menuKey(menubarModel(runningView(), [pomodoro, sitStand], []))
    const two = menuKey(menubarModel(twoRunView(), [pomodoro, sitStand], []))
    expect(two).not.toBe(one)

    const ticked = menuKey(
      menubarModel(
        twoRunView({ countdown: '24:59' }, { countdown: '29:59' }),
        [pomodoro, sitStand],
        [],
      ),
    )
    expect(ticked).toBe(two)
  })
})
