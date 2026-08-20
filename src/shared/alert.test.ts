import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { alertFromRoute, alertRoute, type Alert } from './alert'

describe('alert routes', () => {
  it('carries both labels', () => {
    expect(
      alertFromRoute(
        alertRoute({ completedLabel: 'Focus', nextLabel: 'Break' }),
      ),
    ).toEqual({ completedLabel: 'Focus', nextLabel: 'Break' })
  })

  it('carries the end of a preset, where nothing starts next', () => {
    expect(
      alertFromRoute(alertRoute({ completedLabel: 'Only', nextLabel: null })),
    ).toEqual({ completedLabel: 'Only', nextLabel: null })
  })

  it('is not an overlay route when the window is showing something else', () => {
    expect(alertFromRoute('#/settings')).toBeNull()
  })

  // Labels are user-typed, so they contain the characters that break URLs.
  it('survives any label the user can type', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.option(fc.string(), { nil: null }),
        (completedLabel, nextLabel) => {
          const alert: Alert = { completedLabel, nextLabel }
          expect(alertFromRoute(alertRoute(alert))).toEqual(alert)
        },
      ),
    )
  })
})
