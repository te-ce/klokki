import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { App } from './App'

beforeEach(() => {
  window.klokki = {
    getAppInfo: vi
      .fn()
      .mockResolvedValue({ version: '0.0.0', electron: '43.0.0' }),
  }
})

it('renders the app info reported by the main process', async () => {
  render(<App />)

  expect(await screen.findByText(/Electron 43\.0\.0/)).toBeInTheDocument()
})
