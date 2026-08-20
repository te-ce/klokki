import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SEED_PRESETS } from '../../shared/presets'
import type { Clock } from '../timer/clock'
import { createTimerService, type TimerService } from '../timer/service'
import { createPresetStore, type PresetStore } from './store'
import { startPresetById } from './start'

const T0 = 1_700_000_000_000

let store: PresetStore
let service: TimerService
const clock: Clock = { now: () => T0 }

beforeEach(() => {
  vi.useFakeTimers()
  store = createPresetStore(mkdtempSync(join(tmpdir(), 'klokki-start-')))
  service = createTimerService(clock)
})

afterEach(() => {
  service.dispose()
  vi.useRealTimers()
})

describe('starting by id', () => {
  it('starts the preset with that id', () => {
    startPresetById(service, store, 'pomodoro')

    expect(service.getView().phaseLabel).toBe('Focus')
  })

  it('does nothing for an id the store does not have', () => {
    startPresetById(service, store, 'deleted-a-moment-ago')

    expect(service.getView().running).toBe(false)
  })

  it('starts the saved version, not the one that was on disk at launch', () => {
    store.save({
      ...SEED_PRESETS[0]!,
      phases: [{ label: 'Writing', minutes: 50, notify: true }],
    })

    startPresetById(service, store, 'pomodoro')

    expect(service.getView().phaseLabel).toBe('Writing')
  })
})

/**
 * The documented rule (AGENTS.md): editing a preset never disturbs a run in
 * progress. A phase that shortened under the user's feet would fire immediately,
 * and one that lengthened would silently move a break they were counting on.
 */
describe('editing the preset that is running', () => {
  it('leaves the running timer on the phases it started with', () => {
    startPresetById(service, store, 'pomodoro')

    store.save({
      ...SEED_PRESETS[0]!,
      name: 'Deep work',
      phases: [{ label: 'Writing', minutes: 50, notify: true }],
    })

    expect(service.getView().phaseLabel).toBe('Focus')
    expect(service.getView().presetName).toBe('Pomodoro')
  })

  it('applies the edit on the next start', () => {
    startPresetById(service, store, 'pomodoro')
    store.save({
      ...SEED_PRESETS[0]!,
      name: 'Deep work',
      phases: [{ label: 'Writing', minutes: 50, notify: true }],
    })

    startPresetById(service, store, 'pomodoro')

    expect(service.getView().presetName).toBe('Deep work')
  })

  it('keeps running after the preset is deleted, until it is stopped', () => {
    startPresetById(service, store, 'pomodoro')

    store.remove('pomodoro')

    expect(service.getView().running).toBe(true)
    service.stop()
    expect(service.getView().running).toBe(false)
  })
})
