import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ReminderDefinition, ReminderView } from '../../shared/reminder'
import type { SaveResult } from '../../shared/preset'
import { RemindersSection } from './RemindersSection'
import { fakeKlokki, type FakeKlokki } from './test-support/fake-klokki'

const water: ReminderView = {
  id: 'water',
  name: 'Drink water',
  intervalMinutes: 30,
  steps: [{ label: 'Drink a glass of water' }],
  enabled: true,
  nextFireAt: 1_800_000,
}

/**
 * The bridge, standing in for a main process that owns the list and its
 * schedule: a save, a delete, or an enabled toggle lands in the store and
 * comes back as a push, which is the only way this section learns what the
 * list now is.
 */
const mockApi = (reminders: readonly ReminderView[] = [water]) => {
  let current = reminders
  let api: FakeKlokki
  api = fakeKlokki({
    listReminders: () => Promise.resolve(current),
    saveReminder: (definition: ReminderDefinition): Promise<SaveResult> => {
      current = [
        ...current.filter((r) => r.id !== definition.id),
        { ...definition, nextFireAt: null },
      ]
      api.pushReminders(current)
      return Promise.resolve({ ok: true })
    },
    deleteReminder: (id: string) => {
      current = current.filter((reminder) => reminder.id !== id)
      api.pushReminders(current)
      return Promise.resolve(undefined)
    },
    setReminderEnabled: (id: string, enabled: boolean) => {
      current = current.map((reminder) =>
        reminder.id === id ? { ...reminder, enabled } : reminder,
      )
      api.pushReminders(current)
      return Promise.resolve(undefined)
    },
  })
  return api
}

const edit = async (name: string) => {
  fireEvent.click(await screen.findByRole('button', { name: `Edit ${name}` }))
}

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }))

const savedReminder = (api: ReturnType<typeof mockApi>): ReminderDefinition =>
  api.saveReminder.mock.calls.at(-1)![0]

beforeEach(() => {
  mockApi()
})

describe('the reminder list', () => {
  it('shows name, interval, steps, enabled state and next-fire time', async () => {
    mockApi()
    render(<RemindersSection />)

    expect(
      await screen.findByRole('button', { name: 'Edit Drink water' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/every 30m/)).toBeInTheDocument()
    expect(screen.getByText(/Drink a glass of water/)).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: 'Enable Drink water' }),
    ).toBeChecked()
    expect(screen.getByText(/Next at/)).toBeInTheDocument()
  })

  it('says a reminder is not scheduled once disabled', async () => {
    mockApi([{ ...water, enabled: false, nextFireAt: null }])
    render(<RemindersSection />)

    await screen.findByRole('button', { name: 'Edit Drink water' })

    expect(screen.getByText('Not scheduled')).toBeInTheDocument()
  })

  it('toggles enabled from the list immediately', async () => {
    const api = mockApi()
    render(<RemindersSection />)
    await screen.findByRole('button', { name: 'Edit Drink water' })

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Enable Drink water' }),
    )

    await waitFor(() =>
      expect(api.setReminderEnabled).toHaveBeenCalledWith('water', false),
    )
  })

  it('starts a new reminder with one step to fill in', async () => {
    render(<RemindersSection />)

    fireEvent.click(await screen.findByRole('button', { name: 'New reminder' }))

    expect(screen.getByLabelText('Reminder name')).toHaveValue('')
    expect(screen.getByLabelText('Step 1 label')).toBeInTheDocument()
    expect(screen.queryByLabelText('Step 2 label')).not.toBeInTheDocument()
  })
})

describe('editing a reminder', () => {
  it('loads the chosen reminder into the form', async () => {
    render(<RemindersSection />)

    await edit('Drink water')

    expect(screen.getByLabelText('Reminder name')).toHaveValue('Drink water')
    expect(screen.getByLabelText('Interval')).toHaveValue(30)
    expect(screen.getByLabelText('Step 1 label')).toHaveValue(
      'Drink a glass of water',
    )
  })

  it('saves a renamed reminder under the same id', async () => {
    const api = mockApi()
    render(<RemindersSection />)
    await edit('Drink water')

    fireEvent.change(screen.getByLabelText('Reminder name'), {
      target: { value: 'Hydrate' },
    })
    save()

    await waitFor(() => expect(api.saveReminder).toHaveBeenCalled())
    expect(savedReminder(api).name).toBe('Hydrate')
    expect(savedReminder(api).id).toBe('water')
  })

  it('adds a step with a label and a unit', async () => {
    const api = mockApi()
    render(<RemindersSection />)
    await edit('Drink water')

    fireEvent.click(screen.getByRole('button', { name: 'Add step' }))
    fireEvent.change(screen.getByLabelText('Step 2 label'), {
      target: { value: 'Pushups' },
    })
    fireEvent.change(screen.getByLabelText('Step 2 unit'), {
      target: { value: 'reps' },
    })
    save()

    await waitFor(() => expect(api.saveReminder).toHaveBeenCalled())
    expect(savedReminder(api).steps[1]).toEqual({
      label: 'Pushups',
      unit: 'reps',
    })
  })

  it('deletes a step', async () => {
    const api = mockApi()
    render(<RemindersSection />)
    await edit('Drink water')
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }))
    fireEvent.change(screen.getByLabelText('Step 2 label'), {
      target: { value: 'Pushups' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete step 1' }))
    save()

    await waitFor(() => expect(api.saveReminder).toHaveBeenCalled())
    expect(savedReminder(api).steps).toEqual([{ label: 'Pushups' }])
  })

  it('reorders steps', async () => {
    const api = mockApi()
    render(<RemindersSection />)
    await edit('Drink water')
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }))
    fireEvent.change(screen.getByLabelText('Step 2 label'), {
      target: { value: 'Pushups' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Move step 2 up' }))
    save()

    await waitFor(() => expect(api.saveReminder).toHaveBeenCalled())
    expect(savedReminder(api).steps[0]?.label).toBe('Pushups')
  })

  it('changes the interval', async () => {
    const api = mockApi()
    render(<RemindersSection />)
    await edit('Drink water')

    fireEvent.change(screen.getByLabelText('Interval'), {
      target: { value: '45' },
    })
    save()

    await waitFor(() => expect(api.saveReminder).toHaveBeenCalled())
    expect(savedReminder(api).intervalMinutes).toBe(45)
  })

  it('deletes a reminder and drops it from the list', async () => {
    const api = mockApi()
    render(<RemindersSection />)
    await edit('Drink water')

    fireEvent.click(screen.getByRole('button', { name: 'Delete reminder' }))

    await waitFor(() =>
      expect(api.deleteReminder).toHaveBeenCalledWith('water'),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Edit Drink water' }),
      ).not.toBeInTheDocument(),
    )
  })
})

describe('a reminder that cannot run', () => {
  it('refuses to save a reminder with no steps, and says why', async () => {
    const api = mockApi()
    render(<RemindersSection />)
    await edit('Drink water')

    fireEvent.click(screen.getByRole('button', { name: 'Delete step 1' }))
    save()

    expect(
      await screen.findByText('A reminder needs at least one step.'),
    ).toBeInTheDocument()
    expect(api.saveReminder).not.toHaveBeenCalled()
  })

  it('refuses to save a nameless reminder', async () => {
    const api = mockApi()
    render(<RemindersSection />)
    await edit('Drink water')

    fireEvent.change(screen.getByLabelText('Reminder name'), {
      target: { value: '  ' },
    })
    save()

    expect(
      await screen.findByText('A reminder needs a name.'),
    ).toBeInTheDocument()
    expect(api.saveReminder).not.toHaveBeenCalled()
  })
})

describe('when Save is worth offering', () => {
  const saveButton = () => screen.getByRole('button', { name: 'Save' })

  it('is inactive for a reminder that has only been opened', async () => {
    render(<RemindersSection />)
    await edit('Drink water')

    expect(saveButton()).toBeDisabled()
  })

  it('wakes up for an edit and goes quiet once saved', async () => {
    const api = mockApi()
    render(<RemindersSection />)
    await edit('Drink water')

    fireEvent.change(screen.getByLabelText('Reminder name'), {
      target: { value: 'Hydrate' },
    })
    expect(saveButton()).toBeEnabled()

    save()
    await waitFor(() => expect(api.saveReminder).toHaveBeenCalled())

    expect(saveButton()).toBeDisabled()
  })
})
