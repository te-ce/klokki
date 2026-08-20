import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TransitionOverlay } from './TransitionOverlay'
import { fakeKlokki } from './test-support/fake-klokki'

const mockApi = () => fakeKlokki()

describe('TransitionOverlay', () => {
  it('names the phase that ended and the one starting now', () => {
    mockApi()
    render(
      <TransitionOverlay
        alert={{ completedLabel: 'Focus', nextLabel: 'Break' }}
      />,
    )

    expect(screen.getByText('Focus finished')).toBeVisible()
    expect(screen.getByText('Break')).toBeVisible()
  })

  it('says the timer is done when no phase follows', () => {
    mockApi()
    render(
      <TransitionOverlay alert={{ completedLabel: 'Only', nextLabel: null }} />,
    )

    expect(screen.getByText('Only finished')).toBeVisible()
    expect(screen.getByText('Timer finished')).toBeVisible()
  })

  it('dismisses only when the user acknowledges it', () => {
    const api = mockApi()
    render(
      <TransitionOverlay
        alert={{ completedLabel: 'Focus', nextLabel: 'Break' }}
      />,
    )

    expect(api.dismissAlert).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(api.dismissAlert).toHaveBeenCalledOnce()
  })

  it('offers five more minutes of what the user was doing', () => {
    const api = mockApi()
    render(
      <TransitionOverlay
        alert={{ completedLabel: 'Focus', nextLabel: 'Break' }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Snooze 5 minutes' }))

    expect(api.snoozeAlert).toHaveBeenCalledOnce()
    expect(api.dismissAlert).not.toHaveBeenCalled()
  })

  it('offers no snooze when there is no phase left to push back', () => {
    mockApi()
    render(
      <TransitionOverlay alert={{ completedLabel: 'Only', nextLabel: null }} />,
    )

    expect(screen.queryByRole('button', { name: /Snooze/ })).toBeNull()
  })
})
