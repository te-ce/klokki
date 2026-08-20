import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { appStrokeRatio } from './optical.ts'

describe('appStrokeRatio', () => {
  it('draws a hairline at the sizes big enough to carry one', () => {
    expect(appStrokeRatio(512)).toBeCloseTo(0.0165, 4)
    expect(appStrokeRatio(1024)).toBeCloseTo(0.0165, 4)
  })

  it('thickens the stroke at the sizes where a hairline would disappear', () => {
    expect(appStrokeRatio(32)).toBeCloseTo(0.044, 4)
    expect(appStrokeRatio(16)).toBeCloseTo(0.044, 4)
  })

  it('keeps a 32px stroke visible after rounding to whole pixels', () => {
    // The failure this pins: a ratio small enough that 32 * ratio * 2 rounds
    // below a pixel renders the ring as a grey smear instead of a line.
    expect(32 * appStrokeRatio(32) * 2).toBeGreaterThanOrEqual(2)
  })

  it('never thickens as the icon grows', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 8, max: 2048 }),
        fc.integer({ min: 8, max: 2048 }),
        (a, b) => {
          const [small, large] = a <= b ? [a, b] : [b, a]
          expect(appStrokeRatio(small)).toBeGreaterThanOrEqual(
            appStrokeRatio(large),
          )
        },
      ),
    )
  })

  it('stays within the two anchors for every size', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4096 }), (size) => {
        const ratio = appStrokeRatio(size)
        expect(ratio).toBeGreaterThanOrEqual(0.0165)
        expect(ratio).toBeLessThanOrEqual(0.044)
      }),
    )
  })
})
