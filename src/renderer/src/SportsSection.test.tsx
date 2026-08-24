import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { SaveResult } from '../../shared/preset'
import type { SportSettings, SportsView } from '../../shared/sport'
import { SportsSection } from './SportsSection'
import { fakeKlokki, type FakeKlokki } from './test-support/fake-klokki'

const situpsAndSquats: SportsView = {
  intervalMinutes: 60,
  activities: [
    { id: 'situps', name: 'Situps' },
    { id: 'squats', name: 'Squats' },
  ],
  enabled: true,
  nextFireAt: 3_600_000,
  awaiting: false,
}

/** The bridge, standing in for a main process that owns the one Sports schedule. */
const mockApi = (initial: SportsView = situpsAndSquats) => {
  let current = initial
  let api: FakeKlokki
  api = fakeKlokki({
    getSportsSettings: () => Promise.resolve(current),
    saveSportsSettings: (settings: SportSettings): Promise<SaveResult> => {
      current = { ...current, ...settings }
      api.pushSports(current)
      return Promise.resolve({ ok: true })
    },
    startSports: () => {
      current = { ...current, enabled: true }
      api.pushSports(current)
      return Promise.resolve(undefined)
    },
    stopSports: () => {
      current = { ...current, enabled: false }
      api.pushSports(current)
      return Promise.resolve(undefined)
    },
  })
  return api
}

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }))

const savedSettings = (api: ReturnType<typeof mockApi>): SportSettings =>
  api.saveSportsSettings.mock.calls.at(-1)![0]

beforeEach(() => {
  mockApi()
})

describe('the Sports schedule', () => {
  it('shows the interval, activities and next-fire time', async () => {
    mockApi()
    render(<SportsSection />)

    await screen.findByDisplayValue('Situps')
    expect(screen.getByLabelText('Interval')).toHaveValue(60)
    expect(screen.getByDisplayValue('Squats')).toBeInTheDocument()
    expect(screen.getByText(/Next at/)).toBeInTheDocument()
  })

  it('says not scheduled once disabled', async () => {
    mockApi({ ...situpsAndSquats, enabled: false, nextFireAt: null })
    render(<SportsSection />)

    expect(await screen.findByText('Not scheduled')).toBeInTheDocument()
  })

  it('says waiting for you while a firing is unanswered', async () => {
    mockApi({ ...situpsAndSquats, nextFireAt: null, awaiting: true })
    render(<SportsSection />)

    expect(await screen.findByText('Waiting for you')).toBeInTheDocument()
  })

  it('stops a running schedule from its own button', async () => {
    const api = mockApi()
    render(<SportsSection />)
    await screen.findByDisplayValue('Situps')

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))

    await waitFor(() => expect(api.stopSports).toHaveBeenCalled())
  })

  it('starts a stopped schedule from its own button', async () => {
    const api = mockApi({ ...situpsAndSquats, enabled: false })
    render(<SportsSection />)
    await screen.findByRole('button', { name: 'Start' })

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => expect(api.startSports).toHaveBeenCalled())
  })
})

describe('editing the schedule', () => {
  it('changes the interval', async () => {
    const api = mockApi()
    render(<SportsSection />)
    await screen.findByDisplayValue('Situps')

    fireEvent.change(screen.getByLabelText('Interval'), {
      target: { value: '45' },
    })
    save()

    await waitFor(() => expect(api.saveSportsSettings).toHaveBeenCalled())
    expect(savedSettings(api).intervalMinutes).toBe(45)
  })

  it('adds an activity', async () => {
    const api = mockApi()
    render(<SportsSection />)
    await screen.findByDisplayValue('Situps')

    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }))
    fireEvent.change(screen.getByLabelText('Activity 3 name'), {
      target: { value: 'Pushups' },
    })
    save()

    await waitFor(() => expect(api.saveSportsSettings).toHaveBeenCalled())
    expect(savedSettings(api).activities.at(-1)?.name).toBe('Pushups')
  })

  it('deletes an activity', async () => {
    const api = mockApi()
    render(<SportsSection />)
    await screen.findByDisplayValue('Situps')

    fireEvent.click(screen.getByRole('button', { name: 'Delete activity 1' }))
    save()

    await waitFor(() => expect(api.saveSportsSettings).toHaveBeenCalled())
    expect(savedSettings(api).activities).toEqual([
      { id: 'squats', name: 'Squats' },
    ])
  })

  it('reorders activities', async () => {
    const api = mockApi()
    render(<SportsSection />)
    await screen.findByDisplayValue('Situps')

    fireEvent.click(screen.getByRole('button', { name: 'Move activity 2 up' }))
    save()

    await waitFor(() => expect(api.saveSportsSettings).toHaveBeenCalled())
    expect(savedSettings(api).activities[0]?.name).toBe('Squats')
  })
})

describe('a schedule that cannot run', () => {
  it('refuses to save with no activities, and says why', async () => {
    const api = mockApi()
    render(<SportsSection />)
    await screen.findByDisplayValue('Situps')

    fireEvent.click(screen.getByRole('button', { name: 'Delete activity 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete activity 1' }))
    save()

    expect(
      await screen.findByText('Sports needs at least one activity.'),
    ).toBeInTheDocument()
    expect(api.saveSportsSettings).not.toHaveBeenCalled()
  })
})

describe('when Save is worth offering', () => {
  const saveButton = () => screen.getByRole('button', { name: 'Save' })

  it('is inactive until something is edited', async () => {
    render(<SportsSection />)
    await screen.findByDisplayValue('Situps')

    expect(saveButton()).toBeDisabled()
  })

  it('wakes up for an edit and goes quiet once saved', async () => {
    const api = mockApi()
    render(<SportsSection />)
    await screen.findByDisplayValue('Situps')

    fireEvent.change(screen.getByLabelText('Interval'), {
      target: { value: '45' },
    })
    expect(saveButton()).toBeEnabled()

    save()
    await waitFor(() => expect(api.saveSportsSettings).toHaveBeenCalled())

    expect(saveButton()).toBeDisabled()
  })
})

describe('logging from the tab', () => {
  it('logs only the activities given a quantity', async () => {
    const api = mockApi()
    render(<SportsSection />)
    await screen.findByDisplayValue('Situps')

    fireEvent.change(screen.getByLabelText('Situps'), {
      target: { value: '20' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Log' }))

    await waitFor(() =>
      expect(api.logSports).toHaveBeenCalledWith({ situps: 20 }),
    )
  })
})
