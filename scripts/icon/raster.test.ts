import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Shape } from './mark.ts'
import { coverage } from './raster.ts'

/** A half-plane: every pixel left of x = 8 is inside, and the edge is exact. */
const leftOf: Shape = (x) => x < 8

describe('coverage', () => {
  const alpha = coverage(leftOf, 16)
  const at = (x: number, y: number) => alpha[y * 16 + x]

  it('is opaque well inside the shape and clear well outside', () => {
    expect(at(3, 3)).toBe(255)
    expect(at(12, 3)).toBe(0)
  })

  it('anti-aliases the pixel the edge runs through', () => {
    // The edge at x = 8 falls on a pixel boundary, so pixel 7 is fully in and
    // pixel 8 fully out; a shape shifted half a pixel proves the partial case.
    const shifted = coverage((x) => x < 8.5, 16)
    expect(shifted[8]).toBeGreaterThan(0)
    expect(shifted[8]).toBeLessThan(255)
  })

  it('samples every pixel of the canvas', () => {
    expect(coverage(leftOf, 16)).toHaveLength(256)
  })

  it('stays in range for any shape and size', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 24 }),
        fc.integer({ min: 0, max: 24 }),
        (size, threshold) => {
          for (const value of coverage((x, y) => x + y < threshold, size)) {
            expect(value).toBeGreaterThanOrEqual(0)
            expect(value).toBeLessThanOrEqual(255)
          }
        },
      ),
    )
  })
})
