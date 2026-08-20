import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Preset } from '../../shared/preset'
import type { TimerView } from '../../shared/timer'
import { TimerPanel } from './TimerPanel'

const RUNNING: TimerView = {
  running: true,
  presetName: 'Pomodoro',
  phaseLabel: 'Focus',
  remainingMs: 1_499_000,
  countdown: '25:00',
}

const IDLE: TimerView = {
  running: false,
  presetName: null,
  phaseLabel: null,
  remainingMs: 0,
  countdown: '00:00',
}

const PRESETS: readonly Preset[] = [
  {
    id: 'pomodoro',
    name: 'Pomodoro',
    loop: true,
    phases: [{ label: 'Focus', minutes: 25, notify: true }],
  },
]

/** Captures the listener the panel registers, so a test can push a view. */
let push: (view: TimerView) => void
let unsubscribe: () => void

const mockApi = (initial: TimerView) => {
  unsubscribe = vi.fn<() => void>()
  const api = {
    getAppInfo: vi.fn().mockResolvedValue({ version: '0', electron: '43' }),
    listPresets: vi.fn().mockResolvedValue(PRESETS),
    getTimerView: vi.fn().mockResolvedValue(initial),
    startPreset: vi.fn().mockResolvedValue(undefined),
    stopTimer: vi.fn().mockResolvedValue(undefined),
    dismissAlert: vi.fn().mockResolvedValue(undefined),
    snoozeAlert: vi.fn().mockResolvedValue(undefined),
    savePreset: vi.fn().mockResolvedValue({ ok: true }),
    deletePreset: vi.fn().mockResolvedValue(undefined),
    getLaunchAtLogin: vi.fn().mockResolvedValue(false),
    setLaunchAtLogin: vi.fn().mockResolvedValue(false),
    onTimerView: vi.fn((listener: (view: TimerView) => void) => {
      push = listener
      return unsubscribe
    }),
  }
  window.klokki = api
  return api
}

beforeEach(() => {
  vi.useRealTimers()
})

it('shows the running preset, phase and countdown on mount', async () => {
  mockApi(RUNNING)

  render(<TimerPanel />)

  expect(await screen.findByText('25:00')).toBeInTheDocument()
  expect(screen.getByText('Pomodoro — Focus')).toBeInTheDocument()
})

it('renders each view the main process pushes', async () => {
  mockApi(RUNNING)
  render(<TimerPanel />)
  await screen.findByText('25:00')

  act(() => push({ ...RUNNING, countdown: '24:58' }))

  expect(screen.getByText('24:58')).toBeInTheDocument()
  expect(screen.queryByText('25:00')).not.toBeInTheDocument()
})

it('keeps no countdown of its own: time passing changes nothing', async () => {
  mockApi(RUNNING)
  render(<TimerPanel />)
  await screen.findByText('25:00')

  vi.useFakeTimers()
  vi.advanceTimersByTime(5_000)
  vi.useRealTimers()

  expect(screen.getByText('25:00')).toBeInTheDocument()
})

it('unsubscribes from the main process when unmounted', async () => {
  mockApi(RUNNING)
  const { unmount } = render(<TimerPanel />)
  await screen.findByText('25:00')

  unmount()

  expect(unsubscribe).toHaveBeenCalledOnce()
})

it('starts a preset by id', async () => {
  const api = mockApi(IDLE)
  render(<TimerPanel />)

  fireEvent.click(await screen.findByRole('button', { name: 'Start Pomodoro' }))

  expect(api.startPreset).toHaveBeenCalledWith('pomodoro')
})

it('stops the timer while one is running', async () => {
  const api = mockApi(RUNNING)
  render(<TimerPanel />)

  fireEvent.click(await screen.findByRole('button', { name: 'Stop' }))

  expect(api.stopTimer).toHaveBeenCalledOnce()
})

it('offers no stop button when nothing is running', async () => {
  mockApi(IDLE)
  render(<TimerPanel />)

  await screen.findByRole('button', { name: 'Start Pomodoro' })

  expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
})
