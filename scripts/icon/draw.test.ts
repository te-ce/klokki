import { describe, expect, it } from 'vitest'
import { INK, drawAppIcon, drawTemplate } from './draw.ts'

const TRAY = 22
const RING = TRAY * 0.42

const onRing = (
  size: number,
  deg: number,
  radius: number,
): [number, number] => [
  size / 2 + radius * Math.sin((deg * Math.PI) / 180),
  size / 2 - radius * Math.cos((deg * Math.PI) / 180),
]

describe('drawTemplate', () => {
  const alpha = drawTemplate(TRAY)
  const at = (x: number, y: number) =>
    alpha[Math.round(y) * TRAY + Math.round(x)]!

  it('gives one alpha byte per pixel', () => {
    expect(alpha).toHaveLength(TRAY * TRAY)
  })

  it('draws an unbroken ring, because a notch cannot survive a menubar', () => {
    // At 22px a 12-degree notch is narrower than the stroke that surrounds it,
    // so the menubar glyph drops the notches and keeps the pose. The app icon
    // carries them; this is the same detail loss the icon makes at 16px.
    for (let deg = 0; deg < 360; deg += 3) {
      expect(at(...onRing(TRAY, deg, RING))).toBeGreaterThan(0)
    }
  })

  it('carries the K inside the dial', () => {
    // Measured at ten times the size: every proportion is a fraction of the
    // canvas, and a 22px grid rounds the answer away.
    const large = 220
    const alphaLarge = drawTemplate(large)
    const ring = large * 0.42
    const atLarge = (x: number, y: number) =>
      alphaLarge[Math.round(y) * large + Math.round(x)]!
    const stem = large / 2 - ring * 0.3
    const half = ring * 0.55
    expect(atLarge(stem, large / 2 - half * 0.8)).toBeGreaterThan(0)
    expect(atLarge(stem, large / 2 + half * 0.8)).toBeGreaterThan(0)
    // The wedge between the arms stays open — the glyph must not read as a
    // filled blob at menubar weight, which is what a thicker stroke did.
    expect(atLarge(large / 2 + ring * 0.21, large / 2)).toBe(0)
  })

  it('keeps the K clear of the ring at menubar weight', () => {
    // The gap this glyph lives or dies on: letter and dial are two shapes, and
    // a stroke heavy enough to close the gap turns them into one.
    const large = 220
    const alphaLarge = drawTemplate(large)
    const ring = large * 0.42
    const tip = ring * 0.55 + large * 0.045 // arm tip plus its own stroke
    const gap = (ring - large * 0.045 - tip) / 2
    const [x, y] = onRing(large, 90, ring - large * 0.045 - gap)
    expect(alphaLarge[Math.round(y) * large + Math.round(x)]).toBe(0)
  })

  it('leaves the corners empty so macOS can pad the glyph', () => {
    expect(at(0, 0)).toBe(0)
    expect(at(TRAY - 1, TRAY - 1)).toBe(0)
  })
})

describe('drawAppIcon', () => {
  const SIZE = 128
  const pixels = drawAppIcon(SIZE, SIZE)
  const at = (x: number, y: number): [number, number, number, number] => {
    const o = (Math.round(y) * SIZE + Math.round(x)) * 4
    return [pixels[o]!, pixels[o + 1]!, pixels[o + 2]!, pixels[o + 3]!]
  }

  it('gives four bytes per pixel', () => {
    expect(pixels).toHaveLength(SIZE * SIZE * 4)
  })

  it('is transparent outside the squircle', () => {
    expect(at(0, 0)[3]).toBe(0)
    expect(at(SIZE - 1, 0)[3]).toBe(0)
  })

  it('paints the mark in the ink palette’s foreground', () => {
    // Where the K's two arms meet its stem.
    const [r, g, b, a] = at(SIZE / 2 - SIZE * 0.29 * 0.3, SIZE / 2)
    expect(a).toBe(255)
    expect([r, g, b]).toEqual(INK.mark)
  })

  it('falls from the top of the ground to the bottom', () => {
    const top = at(SIZE / 2, SIZE * 0.12)
    const bottom = at(SIZE / 2, SIZE * 0.88)
    expect(top[3]).toBe(255)
    expect(bottom[3]).toBe(255)
    // Ink is a dark ground that gets darker downwards.
    expect(bottom[0]).toBeLessThan(top[0])
  })

  it('draws the notches: the ring is broken where the app icon has room', () => {
    const ring = SIZE * 0.29
    const onArc = at(...onRing(SIZE, 150, ring))
    const inNotch = at(...onRing(SIZE, 290, ring))
    expect(onArc).toEqual([...INK.mark, 255])
    expect(inNotch).not.toEqual([...INK.mark, 255])
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
