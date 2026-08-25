import { describe, expect, it } from 'vitest'
import type { SportSettings } from '../../shared/sport'
import { STOPPED } from './engine'
import { toSportsView } from './view'

const settings: SportSettings = {
  intervalMinutes: 60,
  activities: [{ id: 'situps', name: 'Situps' }],
  enabled: true,
}

describe('toSportsView', () => {
  it('carries nextFireAt: null for unscheduled settings', () => {
    expect(toSportsView(settings, STOPPED, 0)).toEqual({
      ...settings,
      nextFireAt: null,
      awaiting: false,
      remainingMs: null,
      countdown: null,
    })
  })

  it('carries the scheduled firing and its countdown', () => {
    const state = { scheduled: true, nextFireAt: 10_123 }
    expect(toSportsView(settings, state, 123)).toEqual({
      ...settings,
      nextFireAt: 10_123,
      awaiting: false,
      remainingMs: 10_000,
      countdown: '00:10',
    })
  })

  it('distinguishes waiting for you from not scheduled', () => {
    const awaiting = { scheduled: true, nextFireAt: null }
    expect(toSportsView(settings, awaiting, 0)).toEqual({
      ...settings,
      nextFireAt: null,
      awaiting: true,
      remainingMs: null,
      countdown: null,
    })
  })
})
