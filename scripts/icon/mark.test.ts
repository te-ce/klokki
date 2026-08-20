import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { clockMark, squircle } from './mark.ts'

const SIZE = 512
const RING = SIZE * 0.29

/** A point on the ring's centre line at a bearing clockwise from 12 o'clock. */
const onRing = (deg: number, radius = RING): [number, number] => [
  SIZE / 2 + radius * Math.sin((deg * Math.PI) / 180),
  SIZE / 2 - radius * Math.cos((deg * Math.PI) / 180),
]

describe('clockMark', () => {
  const mark = clockMark(SIZE)

  it('breaks the ring in exactly two places', () => {
    // Walk the ring a degree at a time and count runs of empty bearings. The
    // count is the whole point of the mark: one long work arc, one short break
    // arc. Where the gaps sit is a taste call; that there are two is the spec.
    const covered = Array.from({ length: 360 }, (_, deg) =>
      mark(...onRing(deg)),
    )
    const gaps = covered.filter((here, i) => !here && covered.at(i - 1)).length
    expect(gaps).toBe(2)
  })

  it('leaves the long work arc and the short break arc different lengths', () => {
    const runs: number[] = []
    let run = 0
    for (let deg = 0; deg < 360; deg++) {
      if (mark(...onRing(deg))) run++
      else if (run > 0) {
        runs.push(run)
        run = 0
      }
    }
    if (run > 0) runs[0] = (runs[0] ?? 0) + run // the run wrapping past 0°
    const [long, short] = runs.sort((a, b) => b - a)
    expect(long).toBeGreaterThan(200)
    expect(short).toBeLessThan(90)
    expect(short).toBeGreaterThan(30)
  })

  it('draws a K in the dial, not a pair of hands', () => {
    const stem = SIZE / 2 - RING * 0.3
    const reach = SIZE / 2 + RING * 0.3
    const half = RING * 0.55
    // The stem, top to bottom.
    expect(mark(stem, SIZE / 2 - half * 0.8)).toBe(true)
    expect(mark(stem, SIZE / 2 + half * 0.8)).toBe(true)
    // Both arms, half way along their own length.
    expect(mark((stem + reach) / 2, SIZE / 2 - half / 2)).toBe(true)
    expect(mark((stem + reach) / 2, SIZE / 2 + half / 2)).toBe(true)
    // The wedge the two arms open is empty — a K read as a filled triangle is
    // the failure a heavier stroke or a bigger letter would cause first.
    expect(mark(reach - RING * 0.05, SIZE / 2)).toBe(false)
    // And nothing hangs off the left of the stem.
    expect(mark(stem - RING * 0.12, SIZE / 2)).toBe(false)
  })

  it('leaves the letter clear of the ring it sits in', () => {
    // The K's furthest point is an arm tip; it must not touch the dial, or the
    // letter and the ring read as one closed shape at small sizes.
    const tip = Math.hypot(RING * 0.3, RING * 0.55)
    expect(tip + SIZE * 0.0165).toBeLessThan(RING - SIZE * 0.0165)
  })

  it('draws nothing beyond the ring', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 359 }), (deg) => {
        expect(mark(...onRing(deg, RING * 1.3))).toBe(false)
      }),
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
    // The regression this guards: a mark drawn too large, or with decoration
    // outside the ring, gets clipped by the squircle edge at render time and
    // the icon looks broken only once it is packed.
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: SIZE - 1 }),
        fc.integer({ min: 0, max: SIZE - 1 }),
        (x, y) => {
          if (!clockMark(SIZE)(x, y)) return
          expect(squircle(SIZE)(x, y)).toBe(true)
        },
      ),
      { numRuns: 4000 },
    )
  })
})
