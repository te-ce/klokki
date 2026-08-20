import { describe, expect, it } from 'vitest'
import { notificationFor } from './notification'

describe('what the notification says', () => {
  it('names the phase that ended and the one starting now', () => {
    expect(
      notificationFor({ completedLabel: 'Focus', nextLabel: 'Break' }),
    ).toEqual({
      title: 'Focus finished',
      body: 'Break starting now',
    })
  })

  it('says the timer is done when no phase follows', () => {
    expect(
      notificationFor({ completedLabel: 'Only', nextLabel: null }),
    ).toEqual({
      title: 'Only finished',
      body: 'Timer finished',
    })
  })
})
