import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Preset } from '../../shared/preset'
import { fakeKlokki } from './test-support/fake-klokki'
import { usePresets } from './usePresets'

const preset = (id: string, name: string): Preset => ({
  id,
  name,
  loop: true,
  phases: [{ label: 'Focus', minutes: 25, notify: true }],
})

const Names = () => (
  <p data-testid="names">
    {usePresets()
      .map((p) => p.name)
      .join(', ')}
  </p>
)

const names = () => screen.getByTestId('names').textContent

describe('the saved preset list', () => {
  it('shows the list the main process has on mount', async () => {
    fakeKlokki({
      listPresets: () => Promise.resolve([preset('a', 'Pomodoro')]),
    })

    render(<Names />)

    await waitFor(() => expect(names()).toBe('Pomodoro'))
  })

  it('follows a save made anywhere in the app', async () => {
    const api = fakeKlokki({
      listPresets: () => Promise.resolve([preset('a', 'Pomodoro')]),
    })
    render(<Names />)
    await waitFor(() => expect(names()).toBe('Pomodoro'))

    api.pushPresets([preset('a', 'Pomodoro'), preset('b', 'Stretch')])

    await waitFor(() => expect(names()).toBe('Pomodoro, Stretch'))
  })

  it('keeps an empty pushed list rather than the read it raced', async () => {
    let answer: (presets: readonly Preset[]) => void = () => {}
    const api = fakeKlokki({
      listPresets: () =>
        new Promise<readonly Preset[]>((resolve) => {
          answer = resolve
        }),
    })
    render(<Names />)

    // The user deleted their last preset while the mount read was in flight.
    api.pushPresets([])
    answer([preset('a', 'Pomodoro')])

    await waitFor(() => expect(names()).toBe(''))
  })

  it('leaves no listener behind when the window closes', async () => {
    const api = fakeKlokki()
    const view = render(<Names />)
    await waitFor(() => expect(api.listPresets).toHaveBeenCalled())

    view.unmount()

    expect(api.listenerCount()).toBe(0)
  })
})
