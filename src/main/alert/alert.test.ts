import { describe, expect, it } from 'vitest'
import type { Phase } from '../../shared/preset'
import type { Transition } from '../timer/machine'
import { alertsFor } from './alert'

const phase = (label: string, notify = true): Phase => ({
  label,
  minutes: 5,
  notify,
})

const transition = (
  completed: Phase,
  next: Phase | null,
  at = 1_700_000_000_000,
  presetId = 'test',
): Transition => ({
  completed,
  next,
  cause: 'elapsed',
  presetId,
  startedAt: at - 1,
  at,
})

describe('alertsFor', () => {
  it('has nothing to say when no phase ended', () => {
    expect(alertsFor([])).toEqual([])
  })

  it('names the run, the phase that ended and the one starting now', () => {
    expect(alertsFor([transition(phase('Focus'), phase('Break'))])).toEqual([
      { runId: 'test', completedLabel: 'Focus', nextLabel: 'Break' },
    ])
  })

  it('stays quiet for a phase that does not want to be announced', () => {
    expect(
      alertsFor([transition(phase('Focus', false), phase('Break'))]),
    ).toEqual([])
  })

  // Timing is wall-clock, so the first tick after the lid opens can drain an
  // hour of phases. The user needs to know where the timer is, not receive a
  // burst of nudges for phases that elapsed in the dark.
  it('collapses a drained burst into one alert for the current phase', () => {
    expect(
      alertsFor([
        transition(phase('Focus'), phase('Break')),
        transition(phase('Break'), phase('Focus')),
        transition(phase('Focus'), phase('Break')),
      ]),
    ).toEqual([{ runId: 'test', completedLabel: 'Focus', nextLabel: 'Break' }])
  })

  // Two presets crossing a boundary in the same poll are two things to be told:
  // neither of them is news about the other, so neither is collapsed away.
  it('speaks once per run when two of them cross a boundary at once', () => {
    expect(
      alertsFor([
        transition(phase('Focus'), phase('Break'), 1, 'pomodoro'),
        transition(phase('Sitting'), phase('Standing'), 1, 'sit-stand'),
      ]),
    ).toEqual([
      { runId: 'pomodoro', completedLabel: 'Focus', nextLabel: 'Break' },
      { runId: 'sit-stand', completedLabel: 'Sitting', nextLabel: 'Standing' },
    ])
  })

  // Collapsing is per run, and the run keeps the place its first boundary gave
  // it: the queue behind the overlay is read in this order.
  it('collapses each run separately without reordering them', () => {
    expect(
      alertsFor([
        transition(phase('Focus'), phase('Break'), 1, 'pomodoro'),
        transition(phase('Sitting'), phase('Standing'), 1, 'sit-stand'),
        transition(phase('Break'), phase('Focus'), 2, 'pomodoro'),
      ]),
    ).toEqual([
      { runId: 'pomodoro', completedLabel: 'Break', nextLabel: 'Focus' },
      { runId: 'sit-stand', completedLabel: 'Sitting', nextLabel: 'Standing' },
    ])
  })

  // The user clicked Skip: they know the phase ended, and an overlay to dismiss
  // straight afterwards is an obstacle rather than a nudge.
  it('stays quiet for a boundary the user asked for', () => {
    expect(
      alertsFor([
        {
          ...transition(phase('Sitting'), phase('Standing')),
          cause: 'skipped',
        },
      ]),
    ).toEqual([])
  })

  it('has no next phase to name when the preset ran out', () => {
    expect(alertsFor([transition(phase('Only'), null)])).toEqual([
      { runId: 'test', completedLabel: 'Only', nextLabel: null },
    ])
  })
})
