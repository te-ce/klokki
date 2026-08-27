import { describe, expect, it, vi } from 'vitest'
import { notificationFor } from './notification'

describe('what the notification says', () => {
  it('names the phase that ended and the one starting now', () => {
    expect(
      notificationFor({
        runId: 'pomodoro',
        completedLabel: 'Focus',
        nextLabel: 'Break',
      }),
    ).toEqual({
      title: 'Focus finished',
      body: 'Break starting now',
      actions: [],
    })
  })

  it('offers Stop as a button, and says so in words the platform never picks', () => {
    const stop = vi.fn()

    const text = notificationFor(
      { runId: 'pomodoro', completedLabel: 'Focus', nextLabel: 'Break' },
      stop,
    )

    expect(text.actions).toEqual([
      { label: 'Stop Timer', run: expect.any(Function) },
    ])
    // The button's effect is the caller's stop path, not a second one.
    text.actions[0]?.run()
    expect(stop).toHaveBeenCalledOnce()
  })

  it('leaves the Stop button off a run that has already finished', () => {
    expect(
      notificationFor(
        { runId: 'pomodoro', completedLabel: 'Only', nextLabel: null },
        vi.fn(),
      ).actions,
    ).toEqual([])
  })

  it('says the timer is done when no phase follows', () => {
    expect(
      notificationFor({
        runId: 'pomodoro',
        completedLabel: 'Only',
        nextLabel: null,
      }),
    ).toEqual({
      title: 'Only finished',
      body: 'Timer finished',
      actions: [],
    })
  })
})
