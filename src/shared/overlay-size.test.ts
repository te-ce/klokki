import { describe, expect, it } from 'vitest'
import { sportsOverlayHeight, transitionOverlayHeight } from './overlay-size'

describe('overlay size', () => {
  const WORK_AREA = 1_000

  it('grows the Sports overlay by one row per activity', () => {
    const one = sportsOverlayHeight(1, WORK_AREA)
    const two = sportsOverlayHeight(2, WORK_AREA)

    expect(two - one).toBe(
      sportsOverlayHeight(5, WORK_AREA) - sportsOverlayHeight(4, WORK_AREA),
    )
    expect(two).toBeGreaterThan(one)
  })

  it('stops growing at a share of the work area, whatever the activity count', () => {
    // Past the clamp the rows scroll inside the window; a window taller than
    // the display would put the footer — the only way out — off screen.
    expect(sportsOverlayHeight(50, WORK_AREA)).toBe(800)
    expect(sportsOverlayHeight(500, WORK_AREA)).toBe(800)
    expect(sportsOverlayHeight(50, 600)).toBe(480)
  })

  it('gives the phase overlay room for its eyebrow and no input', () => {
    expect(transitionOverlayHeight()).toBeGreaterThan(
      sportsOverlayHeight(0, WORK_AREA),
    )
    expect(transitionOverlayHeight()).toBeLessThan(
      sportsOverlayHeight(1, WORK_AREA),
    )
  })
})
