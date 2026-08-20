// The Klokki mark: a clock ring with a K inside it. The app icon breaks the
// ring with two notches — a long work arc and a short break arc — where it has
// the resolution for them.
//
// A ring with two hands is what every timer's menubar glyph is, so it says
// nothing about which timer this is; the K does. It also survives 22px better
// than hands do, because a letter is read by its shape and not by the angle
// between two strokes of the same weight.
//
// The menubar template and the app icon share this geometry and nothing else.
// They deliberately differ in weight: a hairline that looks right at 1024px is
// invisible in a 22px menubar, so each caller passes its own stroke.

/** True when the point is inside the shape. Coordinates are in device pixels. */
export type Shape = (x: number, y: number) => boolean

/**
 * The K, in fractions of the ring radius: half its cap height, how far its
 * stem sits left of centre, and how far its arms reach right of it. Stem and
 * reach are equal so the letter is optically centred in the dial rather than
 * hung off its own stem.
 */
const K_HALF_HEIGHT = 0.55
const K_STEM = 0.3
const K_REACH = 0.3

/**
 * Bearings, clockwise from 12 o'clock, where the ring is drawn. The two gaps
 * between them are the notches: the wide one reads as the boundary between a
 * work stretch and a break, the narrow arc as the break itself.
 */
const ARCS: readonly [number, number][] = [
  [6, 284],
  [296, 354],
]

/** The app icon's ring, as a fraction of the canvas. */
export const RING_RADIUS = 0.29

/**
 * Half-width of the rounded square, as a fraction of the canvas: macOS wants
 * app artwork inset from the edge of its own image, so 1024px of icon carries
 * an 824px shape. The exponent is what makes it a squircle rather than a
 * rounded rectangle — the corners stay in motion instead of meeting an arc.
 */
const SQUIRCLE_HALF = 0.402
const SQUIRCLE_EXPONENT = 5

/** The rounded square the app icon's mark sits on. */
export const squircle = (size: number): Shape => {
  const centre = size / 2
  const half = size * SQUIRCLE_HALF
  return (x, y) =>
    Math.abs((x - centre) / half) ** SQUIRCLE_EXPONENT +
      Math.abs((y - centre) / half) ** SQUIRCLE_EXPONENT <=
    1
}

/** Distance from a point to a line segment — a stroke is this, thresholded. */
const distanceToSegment = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number => {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(
          1,
          Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSquared),
        )
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Bearing of a point clockwise from 12 o'clock, in degrees [0, 360). */
const bearingOf = (x: number, y: number, centre: number): number => {
  const deg = (Math.atan2(x - centre, centre - y) * 180) / Math.PI
  return deg < 0 ? deg + 360 : deg
}

/**
 * The three strokes of a K: the stem, and two arms meeting it at mid height.
 * Returned as segments so both the shape and its own test can reason about
 * where the letter ends — nothing else in the mark may reach further out.
 */
const kStrokes = (
  centre: number,
  radius: number,
): readonly [number, number, number, number][] => {
  const half = radius * K_HALF_HEIGHT
  const stem = centre - radius * K_STEM
  const reach = centre + radius * K_REACH
  return [
    [stem, centre - half, stem, centre + half],
    [stem, centre, reach, centre - half],
    [stem, centre, reach, centre + half],
  ]
}

export type MarkOptions = {
  /** Ring radius as a fraction of the canvas. */
  readonly ringRadius?: number
  /** Stroke half-width as a fraction of the canvas. */
  readonly strokeRatio?: number
  /**
   * Whether to cut the notches. They need a gap wider than the stroke around
   * them, which the menubar glyph has no room for.
   */
  readonly notched?: boolean
}

export const clockMark = (
  size: number,
  {
    ringRadius = RING_RADIUS,
    strokeRatio = 0.0165,
    notched = true,
  }: MarkOptions = {},
): Shape => {
  const centre = size / 2
  const radius = size * ringRadius
  const stroke = size * strokeRatio
  const letter = kStrokes(centre, radius)

  return (x, y) => {
    for (const [ax, ay, bx, by] of letter) {
      if (distanceToSegment(x, y, ax, ay, bx, by) <= stroke) return true
    }
    if (Math.abs(Math.hypot(x - centre, y - centre) - radius) > stroke)
      return false
    if (!notched) return true
    const bearing = bearingOf(x, y, centre)
    return ARCS.some(([from, to]) => bearing >= from && bearing <= to)
  }
}
