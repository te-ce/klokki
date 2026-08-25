import { describe, expect, it } from 'vitest'
import { INK, drawAppIcon, drawTemplate } from './draw.ts'

const TRAY = 22

/** A point given as fractions of the canvas from its centre. */
const at = (size: number, fx: number, fy: number): [number, number] => [
  size / 2 + fx * size,
  size / 2 + fy * size,
]

describe('drawTemplate', () => {
  const alpha = drawTemplate(TRAY)
  const pixel = (x: number, y: number) =>
    alpha[Math.round(y) * TRAY + Math.round(x)]!

  it('gives one alpha byte per pixel', () => {
    expect(alpha).toHaveLength(TRAY * TRAY)
  })

  it('carries the whole letter, stem and both arms', () => {
    // Measured at ten times the size: every proportion is a fraction of the
    // canvas, and a 22px grid rounds the answer away.
    const large = 220
    const alphaLarge = drawTemplate(large)
    const atLarge = (fx: number, fy: number) => {
      const [x, y] = at(large, fx, fy)
      return alphaLarge[Math.round(y) * large + Math.round(x)]!
    }
    expect(atLarge(-0.21, -0.3)).toBeGreaterThan(0)
    expect(atLarge(-0.21, 0.3)).toBeGreaterThan(0)
    expect(atLarge(0.21, -0.295)).toBeGreaterThan(0)
    expect(atLarge(0.21, 0.295)).toBeGreaterThan(0)
    // Still arcs at menubar weight: a heavier stroke may not straighten the
    // arms into an ordinary K.
    expect(atLarge(0.04, -0.09)).toBeGreaterThan(0)
    expect(atLarge(0, -0.1475)).toBe(0)
  })

  it('keeps the wedge open at menubar weight', () => {
    // The gap this glyph lives or dies on: the counter between the two arms is
    // what makes it a K, and a stroke heavy enough to close it turns the whole
    // mark into a blob.
    const large = 220
    const alphaLarge = drawTemplate(large)
    const [x, y] = at(large, 0.1, 0)
    expect(alphaLarge[Math.round(y) * large + Math.round(x)]).toBe(0)
  })

  it('leaves the corners empty so macOS can pad the glyph', () => {
    expect(pixel(0, 0)).toBe(0)
    expect(pixel(TRAY - 1, TRAY - 1)).toBe(0)
  })
})

describe('drawAppIcon', () => {
  const SIZE = 128
  const pixels = drawAppIcon(SIZE, SIZE)
  const pixel = (x: number, y: number): [number, number, number, number] => {
    const o = (Math.round(y) * SIZE + Math.round(x)) * 4
    return [pixels[o]!, pixels[o + 1]!, pixels[o + 2]!, pixels[o + 3]!]
  }
  // The app icon insets the letter inside its squircle, so every fraction the
  // mark is measured at is a fraction of that inset.
  const MARK_SCALE = 0.78
  const mark = (fx: number, fy: number) =>
    pixel(...at(SIZE, fx * MARK_SCALE, fy * MARK_SCALE))

  it('gives four bytes per pixel', () => {
    expect(pixels).toHaveLength(SIZE * SIZE * 4)
  })

  it('is transparent outside the squircle', () => {
    expect(pixel(0, 0)[3]).toBe(0)
    expect(pixel(SIZE - 1, 0)[3]).toBe(0)
  })

  it('paints the mark in the ink palette’s foreground', () => {
    // Where the K's two arms meet its stem.
    const [r, g, b, a] = mark(-0.21, 0)
    expect(a).toBe(255)
    expect([r, g, b]).toEqual(INK.mark)
  })

  it('falls from the top of the ground to the bottom', () => {
    const top = pixel(SIZE / 2, SIZE * 0.12)
    const bottom = pixel(SIZE / 2, SIZE * 0.88)
    expect(top[3]).toBe(255)
    expect(bottom[3]).toBe(255)
    // Ink is a dark ground that gets darker downwards.
    expect(bottom[0]).toBeLessThan(top[0])
  })

  it('draws the arms as arcs, not as the straight strokes of a K', () => {
    // On the arm's own curve the mark is at full ink; on the chord between the
    // arm's two ends there is nothing but ground.
    expect(mark(0.04, -0.09)).toEqual([...INK.mark, 255])
    expect(mark(0, -0.1475)).not.toEqual([...INK.mark, 255])
  })

  it('weights the stroke by the size it is seen at, not the pixels it has', () => {
    // Same canvas, different slot: a 32pt icon is drawn with the heavier small
    // stroke, a 256pt one with the hairline. Measured as how much of the mark's
    // colour lands on the ground, which is the only visible difference.
    const inked = (bitmap: Uint8Array) => {
      let total = 0
      for (let i = 0; i < bitmap.length; i += 4) total += bitmap[i]!
      return total
    }
    expect(inked(drawAppIcon(256, 32))).toBeGreaterThan(
      inked(drawAppIcon(256, 256)),
    )
  })
})
