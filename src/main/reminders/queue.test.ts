import { describe, expect, it } from 'vitest'
import type { ReminderDue } from './engine'
import { EMPTY_QUEUE, advance, enqueue, retainPending } from './queue'

const due = (definitionId: string, label: string, at = 0): ReminderDue => ({
  definitionId,
  step: { label },
  at,
})

describe('enqueue', () => {
  it('shows the first due reminder immediately when nothing is showing', () => {
    const result = enqueue(EMPTY_QUEUE, [due('water', 'Drink water')])

    expect(result.toShow).toEqual(due('water', 'Drink water'))
    expect(result.state.current).toEqual(due('water', 'Drink water'))
  })

  it('queues the rest of a batch behind the one it shows', () => {
    const result = enqueue(EMPTY_QUEUE, [
      due('water', 'Drink water'),
      due('pushups', 'Pushups'),
    ])

    expect(result.toShow).toEqual(due('water', 'Drink water'))
    expect(result.state.pending).toEqual([due('pushups', 'Pushups')])
  })

  it('never shows a second reminder while one is already showing', () => {
    const showing = enqueue(EMPTY_QUEUE, [due('water', 'Drink water')]).state
    const result = enqueue(showing, [due('pushups', 'Pushups')])

    expect(result.toShow).toBeNull()
    expect(result.state.current).toEqual(due('water', 'Drink water'))
    expect(result.state.pending).toEqual([due('pushups', 'Pushups')])
  })
})

describe('advance', () => {
  it('shows the next queued reminder after the current one is answered', () => {
    const showing = enqueue(EMPTY_QUEUE, [
      due('water', 'Drink water'),
      due('pushups', 'Pushups'),
    ]).state

    const result = advance(showing)

    expect(result.toShow).toEqual(due('pushups', 'Pushups'))
    expect(result.state.current).toEqual(due('pushups', 'Pushups'))
    expect(result.state.pending).toEqual([])
  })

  it('empties out when nothing is left queued', () => {
    const showing = enqueue(EMPTY_QUEUE, [due('water', 'Drink water')]).state

    const result = advance(showing)

    expect(result.toShow).toBeNull()
    expect(result.state).toEqual(EMPTY_QUEUE)
  })
})

describe('retainPending', () => {
  it('drops the queued reminders that are no longer running', () => {
    const showing = enqueue(EMPTY_QUEUE, [
      due('water', 'Drink water'),
      due('pushups', 'Pushups'),
      due('walk', 'Walk'),
    ]).state

    const state = retainPending(showing, (id) => id !== 'pushups')

    // A reminder stopped while another's overlay is up must not come round in
    // its turn and announce a firing nothing can answer.
    expect(state.pending).toEqual([due('walk', 'Walk')])
  })

  it('leaves what is showing alone, whether it is running or not', () => {
    const showing = enqueue(EMPTY_QUEUE, [due('water', 'Drink water')]).state

    const state = retainPending(showing, () => false)

    // Voiding the one showing means closing a window and showing whatever was
    // behind it, which is the controller's job rather than the queue's.
    expect(state.current).toEqual(due('water', 'Drink water'))
  })
})
