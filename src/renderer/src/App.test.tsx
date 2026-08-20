import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { App } from './App'
import { fakeKlokki } from './test-support/fake-klokki'

beforeEach(() => {
  fakeKlokki()
})

it('renders the app info reported by the main process', async () => {
  render(<App />)

  expect(await screen.findByText(/Electron 43\.0\.0/)).toBeInTheDocument()
})

it('renders the timer panel', async () => {
  render(<App />)

  expect(await screen.findByText('Nothing running.')).toBeInTheDocument()
})
