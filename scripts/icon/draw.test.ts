import { describe, expect, it } from 'vitest'
import { INK, drawAppIcon, drawTemplate } from './draw.ts'

const TRAY = 22
const RING = TRAY * 0.4

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

  it('points its hands at a quarter past twelve, not the icon’s ten past ten', () => {
    expect(at(...onRing(TRAY, 0, RING * 0.4))).toBeGreaterThan(0)
    expect(at(...onRing(TRAY, 90, RING * 0.4))).toBeGreaterThan(0)
    expect(at(...onRing(TRAY, 180, RING * 0.4))).toBe(0)
    expect(at(...onRing(TRAY, 270, RING * 0.4))).toBe(0)
  })

  it('keeps the two hands separable, which is why the pose differs', () => {
    // The legibility property the menubar needs and ten past ten cannot give
    // it: dial left visibly empty between the hands. At this stroke weight two
    // hands leaning the same way merge into one wedge and the glyph reads as a
    // blob. Checked at ten times the size, since every proportion is a fraction
    // of the canvas and a 22px grid rounds the answer away.
    const large = 220
    const alphaLarge = drawTemplate(large)
    const [x, y] = onRing(large, 45, large * 0.4 * 0.55)
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
    const [r, g, b, a] = at(SIZE / 2, SIZE / 2) // the hands meet here
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
