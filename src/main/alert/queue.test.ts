import { describe, expect, it } from 'vitest'
import type { Alert } from '../../shared/alert'
import {
  EMPTY_ALERT_QUEUE,
  answerAlert,
  enqueueAlerts,
  type AlertQueueState,
} from './queue'

const alert = (runId: string, completedLabel = 'Focus'): Alert => ({
  runId,
  completedLabel,
  nextLabel: 'Break',
})

describe('the transition alert queue', () => {
  it('shows the first of a batch and holds the rest', () => {
    const result = enqueueAlerts(EMPTY_ALERT_QUEUE, [
      alert('one'),
      alert('two'),
      alert('three'),
    ])

    expect(result.toShow).toEqual(alert('one'))
    expect(result.state.current).toEqual(alert('one'))
    expect(result.state.pending).toEqual([alert('two'), alert('three')])
  })

  it('shows nothing new while an alert is already on screen', () => {
    const state: AlertQueueState = { current: alert('one'), pending: [] }

    const result = enqueueAlerts(state, [alert('two')])

    expect(result.toShow).toBeNull()
    expect(result.state.current).toEqual(alert('one'))
    expect(result.state.pending).toEqual([alert('two')])
  })

  it('has nothing to do with an empty batch', () => {
    const state: AlertQueueState = { current: alert('one'), pending: [] }
    expect(enqueueAlerts(state, [])).toEqual({ state, toShow: null })
  })

  // A run stopped and restarted raises a fresh boundary. The old entry names one
  // that no longer exists, and a run has at most one unanswered boundary.
  it(`replaces a run's queued entry rather than queueing it twice`, () => {
    const state: AlertQueueState = {
      current: alert('one'),
      pending: [alert('two', 'Sitting')],
    }

    const result = enqueueAlerts(state, [alert('two', 'Standing')])

    expect(result.state.pending).toEqual([alert('two', 'Standing')])
    expect(result.toShow).toBeNull()
  })

  it('supersedes the alert on screen when its own run raises another', () => {
    const state: AlertQueueState = {
      current: alert('one', 'Focus'),
      pending: [alert('two')],
    }

    const result = enqueueAlerts(state, [alert('one', 'Break')])

    expect(result.toShow).toEqual(alert('one', 'Break'))
    expect(result.state.current).toEqual(alert('one', 'Break'))
    expect(result.state.pending).toEqual([alert('two')])
  })

  it('brings the next boundary forward when the one showing is answered', () => {
    const state: AlertQueueState = {
      current: alert('one'),
      pending: [alert('two'), alert('three')],
    }

    const result = answerAlert(state, 'one')

    expect(result.voided).toBe(true)
    expect(result.toShow).toEqual(alert('two'))
    expect(result.state.pending).toEqual([alert('three')])
  })

  it('empties out when the last alert is answered', () => {
    const result = answerAlert({ current: alert('one'), pending: [] }, 'one')

    expect(result).toEqual({
      state: EMPTY_ALERT_QUEUE,
      toShow: null,
      voided: true,
    })
  })

  // Answered from the tray or the Timer pane: the run has no boundary left, but
  // the window on screen is announcing something still perfectly answerable.
  it('drops a queued run without touching the alert on screen', () => {
    const state: AlertQueueState = {
      current: alert('one'),
      pending: [alert('two'), alert('three')],
    }

    const result = answerAlert(state, 'two')

    expect(result.voided).toBe(false)
    expect(result.toShow).toBeNull()
    expect(result.state.current).toEqual(alert('one'))
    expect(result.state.pending).toEqual([alert('three')])
  })

  it('has nothing to do for a run it never heard of', () => {
    const state: AlertQueueState = { current: alert('one'), pending: [] }
    expect(answerAlert(state, 'nobody')).toEqual({
      state,
      toShow: null,
      voided: false,
    })
  })

  it('has nothing to do when nothing is showing', () => {
    expect(answerAlert(EMPTY_ALERT_QUEUE, 'one')).toEqual({
      state: EMPTY_ALERT_QUEUE,
      toShow: null,
      voided: false,
    })
  })
})
