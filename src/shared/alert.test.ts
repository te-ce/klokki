import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { alertFromRoute, alertRoute, type Alert } from './alert'

describe('alert routes', () => {
  it('carries the run and both labels', () => {
    expect(
      alertFromRoute(
        alertRoute({
          runId: 'pomodoro',
          completedLabel: 'Focus',
          nextLabel: 'Break',
        }),
      ),
    ).toEqual({
      runId: 'pomodoro',
      completedLabel: 'Focus',
      nextLabel: 'Break',
    })
  })

  it('carries the end of a preset, where nothing starts next', () => {
    expect(
      alertFromRoute(
        alertRoute({ runId: 'tea', completedLabel: 'Only', nextLabel: null }),
      ),
    ).toEqual({ runId: 'tea', completedLabel: 'Only', nextLabel: null })
  })

  it('is not an overlay route when the window is showing something else', () => {
    expect(alertFromRoute('#/settings')).toBeNull()
  })

  // An overlay that knew the phase but not the run could not answer anything.
  it('is not an overlay route without a run to answer', () => {
    expect(alertFromRoute('#/overlay?completed=Focus&next=Break')).toBeNull()
  })

  // Labels are user-typed, so they contain the characters that break URLs.
  it('survives any label the user can type', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.option(fc.string(), { nil: null }),
        (runId, completedLabel, nextLabel) => {
          const alert: Alert = { runId, completedLabel, nextLabel }
          expect(alertFromRoute(alertRoute(alert))).toEqual(alert)
        },
      ),
    )
  })
})
