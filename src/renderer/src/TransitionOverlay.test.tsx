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

  it('starts the phase that is waiting, named by what it starts', () => {
    const api = mockApi()
    render(
      <TransitionOverlay
        alert={{ completedLabel: 'Focus', nextLabel: 'Break' }}
      />,
    )

    // The run is holding at this boundary until the click, so the button is
    // named after what the click does rather than after closing a window.
    expect(api.dismissAlert).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Start Break' }))

    expect(api.dismissAlert).toHaveBeenCalledOnce()
  })

  it('has only itself to dismiss when the run is over', () => {
    const api = mockApi()
    render(
      <TransitionOverlay alert={{ completedLabel: 'Only', nextLabel: null }} />,
    )

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

    expect(api.snoozeAlert).toHaveBeenCalledWith(5 * 60_000)
    expect(api.dismissAlert).not.toHaveBeenCalled()
  })

  it('also offers 10, 15 and 30 minute increments, matching the other overlays', () => {
    const api = mockApi()
    render(
      <TransitionOverlay
        alert={{ completedLabel: 'Focus', nextLabel: 'Break' }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Snooze 30 minutes' }))

    expect(api.snoozeAlert).toHaveBeenCalledWith(30 * 60_000)
  })

  it('offers no snooze when there is no phase left to push back', () => {
    mockApi()
    render(
      <TransitionOverlay alert={{ completedLabel: 'Only', nextLabel: null }} />,
    )

    expect(screen.queryByRole('button', { name: /Snooze/ })).toBeNull()
  })
})
