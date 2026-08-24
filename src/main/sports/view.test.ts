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
    expect(toSportsView(settings, STOPPED)).toEqual({
      ...settings,
      nextFireAt: null,
      awaiting: false,
    })
  })

  it('carries the scheduled firing', () => {
    const state = { scheduled: true, nextFireAt: 123 }
    expect(toSportsView(settings, state)).toEqual({
      ...settings,
      nextFireAt: 123,
      awaiting: false,
    })
  })

  it('distinguishes waiting for you from not scheduled', () => {
    const awaiting = { scheduled: true, nextFireAt: null }
    expect(toSportsView(settings, awaiting)).toEqual({
      ...settings,
      nextFireAt: null,
      awaiting: true,
    })
  })
})
