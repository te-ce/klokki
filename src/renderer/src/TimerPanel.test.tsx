import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Preset } from '../../shared/preset'
import type { TimerView } from '../../shared/timer'
import {
  fakeKlokki,
  IDLE_VIEW as IDLE,
  runningView,
} from './test-support/fake-klokki'
import { TimerPanel } from './TimerPanel'

const RUNNING: TimerView = runningView()

const PRESETS: readonly Preset[] = [
  {
    id: 'pomodoro',
    name: 'Pomodoro',
    loop: true,
    phases: [{ label: 'Focus', minutes: 25, notify: true }],
  },
]

const mockApi = (initial: TimerView) =>
  fakeKlokki({
    listPresets: () => Promise.resolve(PRESETS),
    getTimerView: () => Promise.resolve(initial),
  })

let api: ReturnType<typeof mockApi>

const push = (view: TimerView) => api.pushTimerView(view)

beforeEach(() => {
  vi.useRealTimers()
})

it('shows the running preset, phase and countdown on mount', async () => {
  api = mockApi(RUNNING)

  render(<TimerPanel />)

  expect(await screen.findByText('25:00')).toBeInTheDocument()
  const heading = screen.getByTestId('running-phase')
  expect(heading).toHaveTextContent('Pomodoro')
  expect(heading).toHaveTextContent('Focus')
})

it('draws the phases at the proportions the view reports', async () => {
  api = mockApi(runningView({ phaseProgress: 0.4 }))
  render(<TimerPanel />)
  await screen.findByText('25:00')

  // A 25/5 preset is a long segment and a short one, not two halves — that
  // ratio is the only reason the bar is worth drawing.
  const [focus, breather] = screen.getAllByTestId('phase-segment')
  expect(focus).toHaveStyle({ flexGrow: '25' })
  expect(breather).toHaveStyle({ flexGrow: '5' })
  // The fill is the fraction main computed, not one this view worked out.
  expect(screen.getByTestId('phase-progress')).toHaveStyle({ width: '40%' })
})

it('says what follows the phase, and that the sequence starts over', async () => {
  api = mockApi(RUNNING)
  render(<TimerPanel />)

  expect(await screen.findByText('Break 5m · then repeat')).toBeInTheDocument()
})

it('promises no repeat for a preset that does not loop', async () => {
  api = mockApi(runningView({ loop: false }))
  render(<TimerPanel />)

  expect(await screen.findByText('Break 5m')).toBeInTheDocument()
})

it('names the last phase of a run as the last one', async () => {
  api = mockApi(
    runningView({ nextPhaseLabel: null, nextPhaseMinutes: null, loop: false }),
  )
  render(<TimerPanel />)

  expect(await screen.findByText('Last phase')).toBeInTheDocument()
})

it('renders each view the main process pushes', async () => {
  api = mockApi(RUNNING)
  render(<TimerPanel />)
  await screen.findByText('25:00')

  act(() => push({ ...RUNNING, countdown: '24:58' }))

  expect(screen.getByText('24:58')).toBeInTheDocument()
  expect(screen.queryByText('25:00')).not.toBeInTheDocument()
})

it('keeps no countdown of its own: time passing changes nothing', async () => {
  api = mockApi(RUNNING)
  render(<TimerPanel />)
  await screen.findByText('25:00')

  vi.useFakeTimers()
  vi.advanceTimersByTime(5_000)
  vi.useRealTimers()

  expect(screen.getByText('25:00')).toBeInTheDocument()
})

it('unsubscribes from the main process when unmounted', async () => {
  api = mockApi(RUNNING)
  const { unmount } = render(<TimerPanel />)
  await screen.findByText('25:00')

  unmount()

  expect(api.listenerCount()).toBe(0)
})

it('offers a preset saved in another window without being reopened', async () => {
  api = mockApi(IDLE)
  render(<TimerPanel />)
  await screen.findByRole('button', { name: 'Start Pomodoro' })

  act(() =>
    api.pushPresets([
      ...PRESETS,
      {
        id: 'stretch',
        name: 'Stretch',
        loop: false,
        phases: PRESETS[0]!.phases,
      },
    ]),
  )

  expect(
    await screen.findByRole('button', { name: 'Start Stretch' }),
  ).toBeInTheDocument()
})

it('follows a rename made in the editor beside it', async () => {
  api = mockApi(IDLE)
  render(<TimerPanel />)
  await screen.findByRole('button', { name: 'Start Pomodoro' })

  act(() => api.pushPresets([{ ...PRESETS[0]!, name: 'Deep work' }]))

  expect(
    await screen.findByRole('button', { name: 'Start Deep work' }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Start Pomodoro' }),
  ).not.toBeInTheDocument()
})

it('offers to restart, not start, what is already running', async () => {
  api = mockApi(RUNNING)
  render(<TimerPanel />)

  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Restart Pomodoro' }),
    ).toBeInTheDocument(),
  )
})

it('starts a preset by id', async () => {
  api = mockApi(IDLE)
  render(<TimerPanel />)

  fireEvent.click(await screen.findByRole('button', { name: 'Start Pomodoro' }))

  expect(api.startPreset).toHaveBeenCalledWith('pomodoro')
})

it('stops the timer while one is running', async () => {
  api = mockApi(RUNNING)
  render(<TimerPanel />)

  fireEvent.click(await screen.findByRole('button', { name: 'Stop' }))

  expect(api.stopTimer).toHaveBeenCalledOnce()
})

it('offers no stop button when nothing is running', async () => {
  api = mockApi(IDLE)
  render(<TimerPanel />)

  await screen.findByRole('button', { name: 'Start Pomodoro' })

  expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
})

it('offers to skip to the phase the view names, and asks main to do it', async () => {
  api = mockApi(RUNNING)
  render(<TimerPanel />)

  fireEvent.click(await screen.findByRole('button', { name: 'Skip to Break' }))

  expect(api.skipPhase).toHaveBeenCalledOnce()
})

it('names the skip by the end when nothing follows the phase', async () => {
  api = mockApi({ ...RUNNING, nextPhaseLabel: null })
  render(<TimerPanel />)

  expect(
    await screen.findByRole('button', { name: 'Skip to the end' }),
  ).toBeInTheDocument()
})

it('offers nothing to skip while idle', async () => {
  api = mockApi(IDLE)
  render(<TimerPanel />)
  await screen.findByText('Nothing running.')

  expect(
    screen.queryByRole('button', { name: /^Skip/ }),
  ).not.toBeInTheDocument()
})
