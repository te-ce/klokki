import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { alertRoute } from '../../shared/alert'
import { Root } from './Root'
import { fakeKlokki } from './test-support/fake-klokki'

const at = (hash: string) => {
  window.location.hash = hash
}

describe('Root', () => {
  it('is only the alert when the window was opened as an overlay', () => {
    fakeKlokki()
    at(
      alertRoute({
        runId: 'pomodoro',
        completedLabel: 'Focus',
        nextLabel: 'Break',
      }),
    )

    render(<Root />)

    expect(screen.getByTestId('transition-overlay')).toBeVisible()
    expect(screen.queryByText('Klokki')).not.toBeInTheDocument()
  })

  it('is the settings window otherwise', () => {
    fakeKlokki()
    at('/settings')

    render(<Root />)

    expect(screen.queryByTestId('transition-overlay')).not.toBeInTheDocument()
    expect(screen.getByText('Klokki')).toBeVisible()
  })
})
