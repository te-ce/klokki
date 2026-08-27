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

/** The one run in progress, as a view reads it. */
const only = () => service.getView().runs[0]

describe('starting by id', () => {
  it('starts the preset with that id', () => {
    startPresetById(service, store, 'pomodoro')

    expect(only()?.phaseLabel).toBe('Focus')
    // The run is named by the preset it runs, which is how everything else
    // reaches it afterwards.
    expect(only()?.runId).toBe('pomodoro')
  })

  it('does nothing for an id the store does not have', () => {
    startPresetById(service, store, 'deleted-a-moment-ago')

    expect(service.getView().runs).toEqual([])
  })

  it('starts the saved version, not the one that was on disk at launch', () => {
    store.save({
      ...SEED_PRESETS[0]!,
      phases: [{ label: 'Writing', minutes: 50, notify: true }],
    })

    startPresetById(service, store, 'pomodoro')

    expect(only()?.phaseLabel).toBe('Writing')
  })

  // Concurrent runs: a second preset joins the first rather than replacing it.
  it('adds a run beside the ones already going', () => {
    startPresetById(service, store, 'pomodoro')
    startPresetById(service, store, 'sit-stand')

    expect(service.getView().runs.map((run) => run.runId)).toEqual([
      'pomodoro',
      'sit-stand',
    ])
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

    expect(only()?.phaseLabel).toBe('Focus')
    expect(only()?.presetName).toBe('Pomodoro')
  })

  it('applies the edit on the next start', () => {
    startPresetById(service, store, 'pomodoro')
    store.save({
      ...SEED_PRESETS[0]!,
      name: 'Deep work',
      phases: [{ label: 'Writing', minutes: 50, notify: true }],
    })

    startPresetById(service, store, 'pomodoro')

    // Restarted in place, not added beside itself: one run per preset.
    expect(service.getView().runs).toHaveLength(1)
    expect(only()?.presetName).toBe('Deep work')
  })

  it('keeps running after the preset is deleted, until it is stopped', () => {
    startPresetById(service, store, 'pomodoro')

    store.remove('pomodoro')

    expect(service.getView().runs).toHaveLength(1)
    service.stop('pomodoro')
    expect(service.getView().runs).toEqual([])
  })
})
