import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { App } from './App'

beforeEach(() => {
  window.klokki = {
    getAppInfo: vi
      .fn()
      .mockResolvedValue({ version: '0.0.0', electron: '43.0.0' }),
    listPresets: vi.fn().mockResolvedValue([]),
    getTimerView: vi.fn().mockResolvedValue({
      running: false,
      presetName: null,
      phaseLabel: null,
      remainingMs: 0,
      countdown: '00:00',
    }),
    startPreset: vi.fn().mockResolvedValue(undefined),
    stopTimer: vi.fn().mockResolvedValue(undefined),
    onTimerView: vi.fn(() => vi.fn()),
  }
})

it('renders the app info reported by the main process', async () => {
  render(<App />)

  expect(await screen.findByText(/Electron 43\.0\.0/)).toBeInTheDocument()
})

it('renders the timer panel', async () => {
  render(<App />)

  expect(await screen.findByText('Nothing running.')).toBeInTheDocument()
})
