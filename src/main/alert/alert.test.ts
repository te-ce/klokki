import { describe, expect, it } from 'vitest'
import type { Phase } from '../../shared/preset'
import type { Transition } from '../timer/machine'
import { alertFor } from './alert'

const phase = (label: string, notify = true): Phase => ({
  label,
  minutes: 5,
  notify,
})

const transition = (
  completed: Phase,
  next: Phase | null,
  at = 1_700_000_000_000,
): Transition => ({ completed, next, at })

describe('alertFor', () => {
  it('has nothing to say when no phase ended', () => {
    expect(alertFor([])).toBeNull()
  })

  it('names the phase that ended and the one starting now', () => {
    expect(alertFor([transition(phase('Focus'), phase('Break'))])).toEqual({
      completedLabel: 'Focus',
      nextLabel: 'Break',
    })
  })

  it('stays quiet for a phase that does not want to be announced', () => {
    expect(
      alertFor([transition(phase('Focus', false), phase('Break'))]),
    ).toBeNull()
  })

  // Timing is wall-clock, so the first tick after the lid opens can drain an
  // hour of phases. The user needs to know where the timer is, not receive a
  // burst of nudges for phases that elapsed in the dark.
  it('collapses a drained burst into one alert for the current phase', () => {
    expect(
      alertFor([
        transition(phase('Focus'), phase('Break')),
        transition(phase('Break'), phase('Focus')),
        transition(phase('Focus'), phase('Break')),
      ]),
    ).toEqual({ completedLabel: 'Focus', nextLabel: 'Break' })
  })

  it('has no next phase to name when the preset ran out', () => {
    expect(alertFor([transition(phase('Only'), null)])).toEqual({
      completedLabel: 'Only',
      nextLabel: null,
    })
  })
})
