import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { GeneralSection } from './GeneralSection'

/** Stands in for the OS login item the main process reads. */
const mockApi = (openAtLogin = false) => {
  let enabled = openAtLogin
  const api = {
    getLaunchAtLogin: vi.fn(() => Promise.resolve(enabled)),
    setLaunchAtLogin: vi.fn((next: boolean) => {
      enabled = next
      return Promise.resolve(enabled)
    }),
  }
  window.klokki = api as never
  return api
}

const toggle = () => screen.findByRole('checkbox', { name: 'Launch at login' })

describe('launch at login', () => {
  it('is off when the OS has no login item', async () => {
    mockApi(false)
    render(<GeneralSection />)

    expect(await toggle()).not.toBeChecked()
  })

  it('is on when the OS does, rather than when the app remembers it', async () => {
    const api = mockApi(true)
    render(<GeneralSection />)

    expect(await toggle()).toBeChecked()
    expect(api.getLaunchAtLogin).toHaveBeenCalled()
  })

  it('registers the login item when switched on', async () => {
    const api = mockApi(false)
    render(<GeneralSection />)

    fireEvent.click(await toggle())

    await waitFor(() => expect(api.setLaunchAtLogin).toHaveBeenCalledWith(true))
    expect(await toggle()).toBeChecked()
  })

  it('removes it again when switched off', async () => {
    const api = mockApi(true)
    render(<GeneralSection />)

    fireEvent.click(await toggle())

    await waitFor(() =>
      expect(api.setLaunchAtLogin).toHaveBeenCalledWith(false),
    )
    expect(await toggle()).not.toBeChecked()
  })

  it('shows the state the OS reports, not the one that was asked for', async () => {
    const api = mockApi(false)
    // Registering a login item can fail — sandboxing, a managed Mac. The UI must
    // not claim it worked.
    api.setLaunchAtLogin.mockResolvedValue(false)
    render(<GeneralSection />)

    fireEvent.click(await toggle())

    await waitFor(() => expect(api.setLaunchAtLogin).toHaveBeenCalled())
    expect(await toggle()).not.toBeChecked()
  })
})
