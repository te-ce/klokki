// The Klokki mark: a clock ring broken by two notches — a long work arc and a
// short break arc — with hands at ten past ten.
//
// The menubar template and the app icon share this geometry and nothing else.
// They deliberately differ in weight: a hairline that looks right at 1024px is
// invisible in a 22px menubar, so each caller passes its own stroke.

/** True when the point is inside the shape. Coordinates are in device pixels. */
export type Shape = (x: number, y: number) => boolean

/** Where the two hands point, clockwise from 12 o'clock: [hour, minute]. */
export type Bearings = readonly [number, number]

/** Hand lengths as a fraction of the ring radius: [hour, minute]. */
export type HandLengths = readonly [number, number]

/**
 * Ten past ten — the pose every watch catalogue uses, because it is open and
 * symmetric. It needs a hairline: at menubar weight the two hands both lean
 * upwards and their strokes merge into a single wedge.
 */
const TEN_PAST_TEN: Bearings = [300, 60]

/** What the app icon's hairline can carry without crowding the ring. */
const HAIRLINE_HANDS: HandLengths = [0.5, 0.74]

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

const point = (
  centre: number,
  radius: number,
  bearing: number,
): [number, number] => [
  centre + radius * Math.sin((bearing * Math.PI) / 180),
  centre - radius * Math.cos((bearing * Math.PI) / 180),
]

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
  /**
   * Hand lengths, as a fraction of the ring radius. A heavier stroke needs
   * shorter hands: the stroke's round cap extends past the tip, so hands drawn
   * for a hairline reach the ring once the stroke thickens.
   */
  readonly handLengths?: HandLengths
  /**
   * Where the hands point. A pose whose hands leave the centre in similar
   * directions needs a thin stroke to stay readable, so the menubar glyph
   * chooses a perpendicular one instead.
   */
  readonly bearings?: Bearings
}

export const clockMark = (
  size: number,
  {
    ringRadius = RING_RADIUS,
    strokeRatio = 0.0165,
    notched = true,
    handLengths = HAIRLINE_HANDS,
    bearings = TEN_PAST_TEN,
  }: MarkOptions = {},
): Shape => {
  const centre = size / 2
  const radius = size * ringRadius
  const stroke = size * strokeRatio
  const [hourLength, minuteLength] = handLengths
  const [hourBearing, minuteBearing] = bearings
  const [hourX, hourY] = point(centre, radius * hourLength, hourBearing)
  const [minuteX, minuteY] = point(centre, radius * minuteLength, minuteBearing)

  return (x, y) => {
    if (distanceToSegment(x, y, centre, centre, hourX, hourY) <= stroke)
      return true
    if (distanceToSegment(x, y, centre, centre, minuteX, minuteY) <= stroke)
      return true
    if (Math.abs(Math.hypot(x - centre, y - centre) - radius) > stroke)
      return false
    if (!notched) return true
    const bearing = bearingOf(x, y, centre)
    return ARCS.some(([from, to]) => bearing >= from && bearing <= to)
  }
}
