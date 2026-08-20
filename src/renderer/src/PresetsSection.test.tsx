import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Preset, SaveResult } from '../../shared/preset'
import { PresetsSection } from './PresetsSection'
import { fakeKlokki, type FakeKlokki } from './test-support/fake-klokki'

const pomodoro: Preset = {
  id: 'pomodoro',
  name: 'Pomodoro',
  loop: true,
  phases: [
    { label: 'Focus', minutes: 25, notify: true },
    { label: 'Break', minutes: 5, notify: false },
  ],
}

/**
 * The bridge, standing in for a main process that owns the list: a save or a
 * delete lands in the store and comes back as a push, which is the only way this
 * section learns what the list now is.
 */
const mockApi = (presets: readonly Preset[] = [pomodoro]) => {
  let current = presets
  let api: FakeKlokki
  api = fakeKlokki({
    listPresets: () => Promise.resolve(current),
    savePreset: (preset: Preset): Promise<SaveResult> => {
      current = [...current.filter((p) => p.id !== preset.id), preset]
      api.pushPresets(current)
      return Promise.resolve({ ok: true })
    },
    deletePreset: (id: string) => {
      current = current.filter((preset) => preset.id !== id)
      api.pushPresets(current)
      return Promise.resolve(undefined)
    },
  })
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
    // The list arrives as a push from the owner, so the editor never asks twice.
    expect(api.listPresets).toHaveBeenCalledTimes(1)
  })

  it('shows a preset saved in another window while this one was open', async () => {
    const api = mockApi()
    render(<PresetsSection />)
    await screen.findByRole('button', { name: 'Edit Pomodoro' })

    api.pushPresets([pomodoro, { ...pomodoro, id: 'stretch', name: 'Stretch' }])

    expect(
      await screen.findByRole('button', { name: 'Edit Stretch' }),
    ).toBeInTheDocument()
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
    // Save is only offered for a draft that differs from what was opened, so
    // the form has to have been touched before the main process can refuse it.
    fireEvent.change(screen.getByLabelText('Preset name'), {
      target: { value: 'Deep work' },
    })

    save()

    expect(
      await screen.findByText('A preset needs a name.'),
    ).toBeInTheDocument()
  })
})

describe('when Save is worth offering', () => {
  const saveButton = () => screen.getByRole('button', { name: 'Save' })

  it('is inactive for a preset that has only been opened', async () => {
    render(<PresetsSection />)
    await edit('Pomodoro')

    expect(saveButton()).toBeDisabled()
  })

  it('is inactive for a new preset until something is typed into it', async () => {
    render(<PresetsSection />)
    fireEvent.click(await screen.findByRole('button', { name: 'New preset' }))

    expect(saveButton()).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Preset name'), {
      target: { value: 'Tea' },
    })

    expect(saveButton()).toBeEnabled()
  })

  it('wakes up for an edit to the name, a phase, or the repeat flag', async () => {
    render(<PresetsSection />)

    await edit('Pomodoro')
    fireEvent.change(screen.getByLabelText('Phase 1 minutes'), {
      target: { value: '30' },
    })
    expect(saveButton()).toBeEnabled()

    // Collapsed by the first click (it was already open), reopened fresh by the second.
    await edit('Pomodoro')
    await edit('Pomodoro')
    fireEvent.click(screen.getByLabelText('Repeat when the last phase ends'))
    expect(saveButton()).toBeEnabled()

    await edit('Pomodoro')
    await edit('Pomodoro')
    fireEvent.click(screen.getByLabelText('Move phase 2 up'))
    expect(saveButton()).toBeEnabled()
  })

  it('goes quiet again when the draft is typed back to what was opened', async () => {
    render(<PresetsSection />)
    await edit('Pomodoro')
    const name = screen.getByLabelText('Preset name')

    fireEvent.change(name, { target: { value: 'Pomodor' } })
    expect(saveButton()).toBeEnabled()

    fireEvent.change(name, { target: { value: 'Pomodoro' } })
    expect(saveButton()).toBeDisabled()
  })

  it('goes quiet again once the draft is on disk', async () => {
    const api = mockApi()
    render(<PresetsSection />)
    await edit('Pomodoro')
    fireEvent.change(screen.getByLabelText('Preset name'), {
      target: { value: 'Deep work' },
    })

    save()
    await waitFor(() => expect(api.savePreset).toHaveBeenCalled())

    expect(saveButton()).toBeDisabled()
  })
})
