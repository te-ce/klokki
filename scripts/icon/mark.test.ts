import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { arcK, squircle } from './mark.ts'

const SIZE = 512
const CENTRE = SIZE / 2

/** A point given as fractions of the canvas from its centre. */
const at = (fx: number, fy: number): [number, number] => [
  CENTRE + fx * SIZE,
  CENTRE + fy * SIZE,
]

describe('arcK', () => {
  const mark = arcK(SIZE)

  it('draws the stem from top to bottom', () => {
    expect(mark(...at(-0.21, -0.3))).toBe(true)
    expect(mark(...at(-0.21, 0))).toBe(true)
    expect(mark(...at(-0.21, 0.3))).toBe(true)
    // And it stops: the stem is a letter's height, not the whole canvas.
    expect(mark(...at(-0.21, -0.38))).toBe(false)
  })

  it('reaches both arm tips', () => {
    expect(mark(...at(0.21, -0.295))).toBe(true)
    expect(mark(...at(0.21, 0.295))).toBe(true)
  })

  it('bows the arms off the straight line a K would use', () => {
    // The whole idea of the mark: an arm that is an arc is inked where its own
    // curve runs and empty where the chord between its ends does. A straight-
    // armed K passes every other test in this file and fails this one.
    expect(mark(...at(0.04, -0.09))).toBe(true)
    expect(mark(...at(0, -0.1475))).toBe(false)
    expect(mark(...at(0.04, 0.09))).toBe(true)
    expect(mark(...at(0, 0.1475))).toBe(false)
  })

  it('keeps the wedge between the arms open', () => {
    // A K read as a filled triangle is the failure a heavier stroke or a
    // shallower bow would cause first.
    expect(mark(...at(0.1, 0))).toBe(false)
    expect(mark(...at(0.15, 0))).toBe(false)
  })

  it('hangs nothing off the left of the stem', () => {
    expect(mark(...at(-0.28, 0))).toBe(false)
  })

  it('is symmetric about its own waist', () => {
    // The two arms are one arc and its mirror, so any pixel and its reflection
    // answer alike. A sign slipped into the bow shows up here first.
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: SIZE - 1 }),
        fc.integer({ min: 0, max: SIZE - 1 }),
        (x, y) => {
          expect(mark(x, y)).toBe(mark(x, SIZE - y))
        },
      ),
    )
  })
})

describe('squircle', () => {
  const shape = squircle(SIZE)

  it('fills the centre and clears the corners', () => {
    expect(shape(SIZE / 2, SIZE / 2)).toBe(true)
    expect(shape(0, 0)).toBe(false)
    expect(shape(SIZE - 1, SIZE - 1)).toBe(false)
  })

  it('leaves a margin on every edge, as macOS icon artwork must', () => {
    for (const [x, y] of [
      [SIZE / 2, 2],
      [SIZE / 2, SIZE - 3],
      [2, SIZE / 2],
      [SIZE - 3, SIZE / 2],
    ]) {
      expect(shape(x!, y!)).toBe(false)
    }
  })

  it('has flatter shoulders than a circle of the same width', () => {
    // The point that separates a squircle from a circle: at 45 degrees a
    // squircle still has material where a circle inscribed in the same box
    // has already curved away.
    const half = SIZE * 0.402
    const diagonal = half * Math.SQRT1_2 * 1.12
    expect(shape(SIZE / 2 + diagonal, SIZE / 2 + diagonal)).toBe(true)
  })
})

describe('the mark inside the squircle', () => {
  it('never touches the squircle it sits in', () => {
    // The regression this guards: a mark drawn too large, or an arm bowed far
    // enough to leave the letter, gets clipped by the squircle edge at render
    // time and the icon looks broken only once it is packed.
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: SIZE - 1 }),
        fc.integer({ min: 0, max: SIZE - 1 }),
        (x, y) => {
          if (!arcK(SIZE, { strokeRatio: 0.05 })(x, y)) return
          expect(squircle(SIZE)(x, y)).toBe(true)
        },
      ),
      { numRuns: 4000 },
    )
  })
})
