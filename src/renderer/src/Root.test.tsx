import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { alertRoute } from '../../shared/alert'
import { Root } from './Root'

const mockApi = () => {
  window.klokki = {
    getAppInfo: vi.fn(() => Promise.resolve({ version: '0', electron: '0' })),
    getTimerView: vi.fn(() => Promise.resolve(null)),
    listPresets: vi.fn(() => Promise.resolve([])),
    getLaunchAtLogin: vi.fn(() => Promise.resolve(false)),
    onTimerView: vi.fn(() => () => {}),
    dismissAlert: vi.fn(() => Promise.resolve()),
  } as never
}

const at = (hash: string) => {
  window.location.hash = hash
}

describe('Root', () => {
  it('is only the alert when the window was opened as an overlay', () => {
    mockApi()
    at(alertRoute({ completedLabel: 'Focus', nextLabel: 'Break' }))

    render(<Root />)

    expect(screen.getByTestId('transition-overlay')).toBeVisible()
    expect(screen.queryByText('Klokki')).not.toBeInTheDocument()
  })

  it('is the settings window otherwise', () => {
    mockApi()
    at('/settings')

    render(<Root />)

    expect(screen.queryByTestId('transition-overlay')).not.toBeInTheDocument()
    expect(screen.getByText('Klokki')).toBeVisible()
  })
})
