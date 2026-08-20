import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { App } from './App'
import { fakeKlokki } from './test-support/fake-klokki'

beforeEach(() => {
  fakeKlokki()
})

const go = (section: string) =>
  fireEvent.click(screen.getByRole('button', { name: section }))

it('renders the app info reported by the main process', async () => {
  render(<App />)

  expect(await screen.findByText(/Electron 43\.0\.0/)).toBeInTheDocument()
})

it('opens on the timer', async () => {
  render(<App />)

  expect(await screen.findByText('Nothing running.')).toBeInTheDocument()
})

it('shows one pane at a time', async () => {
  render(<App />)
  await screen.findByText('Nothing running.')

  go('Presets')

  expect(screen.getByRole('button', { name: 'New preset' })).toBeInTheDocument()
  expect(screen.queryByText('Nothing running.')).not.toBeInTheDocument()
})

it('marks the pane it is showing as the current one', async () => {
  render(<App />)
  await screen.findByText('Nothing running.')

  go('Stats')

  expect(screen.getByRole('button', { name: 'Stats' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  expect(screen.getByRole('button', { name: 'Timer' })).not.toHaveAttribute(
    'aria-current',
  )
})

// A pane that is not on screen is not mounted, so coming back to one must read
// again rather than show what was true when the window opened.
it('re-reads a pane that is returned to', async () => {
  const api = fakeKlokki()
  render(<App />)
  await screen.findByText('Nothing running.')

  go('General')
  await waitFor(() => expect(api.getLaunchAtLogin).toHaveBeenCalledTimes(1))
  go('Timer')
  go('General')

  await waitFor(() => expect(api.getLaunchAtLogin).toHaveBeenCalledTimes(2))
})

it('leaves no subscription behind when a pane is left', async () => {
  const api = fakeKlokki()
  render(<App />)
  await screen.findByText('Nothing running.')
  expect(api.listenerCount()).toBeGreaterThan(0)

  go('General')

  expect(api.listenerCount()).toBe(0)
})
