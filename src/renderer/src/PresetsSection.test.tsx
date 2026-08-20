import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Preset, SaveResult } from '../../shared/preset'
import { PresetsSection } from './PresetsSection'

const pomodoro: Preset = {
  id: 'pomodoro',
  name: 'Pomodoro',
  loop: true,
  phases: [
    { label: 'Focus', minutes: 25, notify: true },
    { label: 'Break', minutes: 5, notify: false },
  ],
}

/** The whole bridge the section is allowed to touch (see src/shared/ipc.ts). */
const mockApi = (presets: readonly Preset[] = [pomodoro]) => {
  let current = presets
  const api = {
    getAppInfo: vi.fn().mockResolvedValue({ version: '0', electron: '43' }),
    listPresets: vi.fn(() => Promise.resolve(current)),
    getTimerView: vi.fn(),
    startPreset: vi.fn().mockResolvedValue(undefined),
    stopTimer: vi.fn().mockResolvedValue(undefined),
    savePreset: vi.fn((preset: Preset): Promise<SaveResult> => {
      current = [...current.filter((p) => p.id !== preset.id), preset]
      return Promise.resolve({ ok: true })
    }),
    deletePreset: vi.fn((id: string) => {
      current = current.filter((preset) => preset.id !== id)
      return Promise.resolve(undefined)
    }),
    getLaunchAtLogin: vi.fn().mockResolvedValue(false),
    setLaunchAtLogin: vi.fn().mockResolvedValue(false),
    onTimerView: vi.fn(() => vi.fn()),
    dismissAlert: vi.fn(() => Promise.resolve()),
    snoozeAlert: vi.fn(() => Promise.resolve()),
  }
  window.klokki = api
  return api
}

const edit = async (name: string) => {
  fireEvent.click(await screen.findByRole('button', { name: `Edit ${name}` }))
}

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }))

const savedPreset = (api: ReturnType<typeof mockApi>): Preset =>
  api.savePreset.mock.calls.at(-1)![0]

beforeEach(() => {
  mockApi()
})

describe('choosing what to edit', () => {
  it('lists the presets the main process has', async () => {
    render(<PresetsSection />)

    expect(
      await screen.findByRole('button', { name: 'Edit Pomodoro' }),
    ).toBeInTheDocument()
  })

  it('loads the chosen preset into the form', async () => {
    render(<PresetsSection />)

    await edit('Pomodoro')

    expect(screen.getByLabelText('Preset name')).toHaveValue('Pomodoro')
    expect(screen.getByLabelText('Phase 1 label')).toHaveValue('Focus')
    expect(screen.getByLabelText('Phase 1 minutes')).toHaveValue(25)
    expect(screen.getByLabelText('Phase 2 label')).toHaveValue('Break')
  })

  it('starts a new preset with one phase to fill in', async () => {
    render(<PresetsSection />)

    fireEvent.click(await screen.findByRole('button', { name: 'New preset' }))

    expect(screen.getByLabelText('Preset name')).toHaveValue('')
    expect(screen.getByLabelText('Phase 1 label')).toBeInTheDocument()
    expect(screen.queryByLabelText('Phase 2 label')).not.toBeInTheDocument()
  })
})

describe('editing a preset', () => {
  it('saves a renamed preset under the same id', async () => {
    const api = mockApi()
    render(<PresetsSection />)
    await edit('Pomodoro')

    fireEvent.change(screen.getByLabelText('Preset name'), {
      target: { value: 'Deep work' },
    })
    save()

    await waitFor(() => expect(api.savePreset).toHaveBeenCalled())
    expect(savedPreset(api)).toEqual({ ...pomodoro, name: 'Deep work' })
  })

  it('saves an edited phase label, length and notify flag', async () => {
    const api = mockApi()
    render(<PresetsSection />)
    await edit('Pomodoro')

    fireEvent.change(screen.getByLabelText('Phase 1 label'), {
      target: { value: 'Writing' },
    })
    fireEvent.change(screen.getByLabelText('Phase 1 minutes'), {
      target: { value: '50' },
    })
    fireEvent.click(screen.getByLabelText('Notify at the end of phase 1'))
    save()

    await waitFor(() => expect(api.savePreset).toHaveBeenCalled())
    expect(savedPreset(api).phases[0]).toEqual({
      label: 'Writing',
      minutes: 50,
      notify: false,
    })
  })

  it('adds a phase', async () => {
    const api = mockApi()
    render(<PresetsSection />)
    await edit('Pomodoro')

    fireEvent.click(screen.getByRole('button', { name: 'Add phase' }))
    fireEvent.change(screen.getByLabelText('Phase 3 label'), {
      target: { value: 'Long break' },
    })
    fireEvent.change(screen.getByLabelText('Phase 3 minutes'), {
      target: { value: '15' },
    })
    save()

    await waitFor(() => expect(api.savePreset).toHaveBeenCalled())
    expect(savedPreset(api).phases).toHaveLength(3)
    expect(savedPreset(api).phases[2]).toEqual({
      label: 'Long break',
      minutes: 15,
      notify: true,
    })
  })

  it('deletes a phase', async () => {
    const api = mockApi()
    render(<PresetsSection />)
    await edit('Pomodoro')

    fireEvent.click(screen.getByRole('button', { name: 'Delete phase 1' }))
    save()

    await waitFor(() => expect(api.savePreset).toHaveBeenCalled())
    expect(savedPreset(api).phases).toEqual([pomodoro.phases[1]])
  })

  it('reorders phases', async () => {
    const api = mockApi()
    render(<PresetsSection />)
    await edit('Pomodoro')

    fireEvent.click(screen.getByRole('button', { name: 'Move phase 2 up' }))
    save()

    await waitFor(() => expect(api.savePreset).toHaveBeenCalled())
    expect(savedPreset(api).phases).toEqual([
      pomodoro.phases[1],
      pomodoro.phases[0],
    ])
  })

  it('cannot move the first phase up or the last phase down', async () => {
    render(<PresetsSection />)
    await edit('Pomodoro')

    expect(
      screen.getByRole('button', { name: 'Move phase 1 up' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Move phase 2 down' }),
    ).toBeDisabled()
  })

  it('toggles looping', async () => {
    const api = mockApi()
    render(<PresetsSection />)
    await edit('Pomodoro')

    fireEvent.click(screen.getByLabelText('Repeat when the last phase ends'))
    save()

    await waitFor(() => expect(api.savePreset).toHaveBeenCalled())
    expect(savedPreset(api).loop).toBe(false)
  })
})

describe('creating and deleting whole presets', () => {
  it('saves a new preset with an id of its own', async () => {
    const api = mockApi()
    render(<PresetsSection />)
    fireEvent.click(await screen.findByRole('button', { name: 'New preset' }))

    fireEvent.change(screen.getByLabelText('Preset name'), {
      target: { value: 'Stretch' },
    })
    fireEvent.change(screen.getByLabelText('Phase 1 label'), {
      target: { value: 'Move' },
    })
    fireEvent.change(screen.getByLabelText('Phase 1 minutes'), {
      target: { value: '2' },
    })
    save()

    await waitFor(() => expect(api.savePreset).toHaveBeenCalled())
    const saved = savedPreset(api)
    expect(saved.name).toBe('Stretch')
    expect(saved.id).not.toBe('pomodoro')
    expect(saved.id).not.toBe('')
  })

  it('shows a saved preset in the list without a relaunch', async () => {
    const api = mockApi()
    render(<PresetsSection />)
    await edit('Pomodoro')
    fireEvent.change(screen.getByLabelText('Preset name'), {
      target: { value: 'Deep work' },
    })

    save()

    expect(
      await screen.findByRole('button', { name: 'Edit Deep work' }),
    ).toBeInTheDocument()
    expect(api.listPresets).toHaveBeenCalledTimes(2)
  })

  it('deletes a preset and drops it from the list', async () => {
    const api = mockApi()
    render(<PresetsSection />)
    await edit('Pomodoro')

    fireEvent.click(screen.getByRole('button', { name: 'Delete preset' }))

    await waitFor(() =>
      expect(api.deletePreset).toHaveBeenCalledWith('pomodoro'),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Edit Pomodoro' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('closes the form once the edited preset is gone', async () => {
    render(<PresetsSection />)
    await edit('Pomodoro')

    fireEvent.click(screen.getByRole('button', { name: 'Delete preset' }))

    await waitFor(() =>
      expect(screen.queryByLabelText('Preset name')).not.toBeInTheDocument(),
    )
  })
})

describe('a preset that cannot run', () => {
  it('refuses to save a preset with no phases, and says why', async () => {
    const api = mockApi()
    render(<PresetsSection />)
    await edit('Pomodoro')

    fireEvent.click(screen.getByRole('button', { name: 'Delete phase 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete phase 1' }))
    save()

    expect(
      await screen.findByText('A preset needs at least one phase.'),
    ).toBeInTheDocument()
    expect(api.savePreset).not.toHaveBeenCalled()
  })

  it('refuses to save a zero-minute phase, and says which one', async () => {
    const api = mockApi()
    render(<PresetsSection />)
    await edit('Pomodoro')

    fireEvent.change(screen.getByLabelText('Phase 2 minutes'), {
      target: { value: '0' },
    })
    save()

    expect(
      await screen.findByText('Phase 2 needs to be longer than zero minutes.'),
    ).toBeInTheDocument()
    expect(api.savePreset).not.toHaveBeenCalled()
  })

  it('refuses to save a nameless preset', async () => {
    const api = mockApi()
    render(<PresetsSection />)
    await edit('Pomodoro')

    fireEvent.change(screen.getByLabelText('Preset name'), {
      target: { value: '  ' },
    })
    save()

    expect(
      await screen.findByText('A preset needs a name.'),
    ).toBeInTheDocument()
    expect(api.savePreset).not.toHaveBeenCalled()
  })

  it('clears the message once the problem is fixed', async () => {
    const api = mockApi()
    render(<PresetsSection />)
    await edit('Pomodoro')
    fireEvent.change(screen.getByLabelText('Preset name'), {
      target: { value: '' },
    })
    save()
    await screen.findByText('A preset needs a name.')

    fireEvent.change(screen.getByLabelText('Preset name'), {
      target: { value: 'Deep work' },
    })
    save()

    await waitFor(() => expect(api.savePreset).toHaveBeenCalled())
    expect(screen.queryByText('A preset needs a name.')).not.toBeInTheDocument()
  })

  it('shows the problems the main process reports, even if the form allowed it', async () => {
    const api = mockApi()
    api.savePreset.mockResolvedValue({
      ok: false,
      problems: ['A preset needs a name.'],
    })
    render(<PresetsSection />)
    await edit('Pomodoro')

    save()

    expect(
      await screen.findByText('A preset needs a name.'),
    ).toBeInTheDocument()
  })
})
