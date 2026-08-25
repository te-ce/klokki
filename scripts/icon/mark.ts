// The Klokki mark: the letter K, drawn with its two arms struck as arcs rather
// than as straight strokes. A dial with hands is what every timer's glyph is,
// so it identifies nothing; the letter is Klokki's own, and bending its arms
// onto a curve is what makes it a letterform only a clock would have drawn.
//
// There is no ring. The K is the whole mark, which is what lets the menubar
// template and the app icon share the geometry exactly and differ only in
// weight: a hairline that looks right at 1024px is invisible at 22px, so each
// caller passes its own stroke.

/** True when the point is inside the shape. Coordinates are in device pixels. */
export type Shape = (x: number, y: number) => boolean

/** A point in device pixels. */
type Point = readonly [number, number]

/**
 * The letter, in fractions of the canvas measured from its centre. Stem and
 * arm tip sit the same distance either side of it, so the K is optically
 * centred rather than hung off its own stem.
 */
const STEM_X = -0.21
const STEM_HALF = 0.32
const TIP_X = 0.21
const TIP_Y = 0.295

/**
 * How far each arm bows off the straight line between stem and tip, as a
 * fraction of the canvas. The bow always faces the letter's own centre, so the
 * arms sweep around the counter rather than bulging out of it — and it is the
 * one measurement that separates this mark from a plain K.
 */
const ARM_BOW = 0.07

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

const TAU = Math.PI * 2

/** An angle folded into [0, 2π). */
const turn = (angle: number): number => ((angle % TAU) + TAU) % TAU

/**
 * A stroked circular arc from `from` to `to`, bowing `bow` towards `centre`,
 * with round caps at both ends.
 *
 * The arc is the minor one of the circle through both points, so the shape is
 * a distance band cut to an angular span — no path flattening, and the same
 * cost per probe whatever the canvas.
 */
const arcStroke = (
  [sx, sy]: Point,
  [ex, ey]: Point,
  centre: number,
  bow: number,
  stroke: number,
): Shape => {
  const mx = (sx + ex) / 2
  const my = (sy + ey) / 2
  const length = Math.hypot(ex - sx, ey - sy)
  const radius = ((length * length) / 4 + bow * bow) / (2 * bow)

  // The normal facing the canvas centre: the side the arc bows towards, and so
  // the side opposite the circle it is cut from.
  let nx = -(ey - sy) / length
  let ny = (ex - sx) / length
  if ((centre - mx) * nx + (centre - my) * ny < 0) {
    nx = -nx
    ny = -ny
  }
  const ox = mx - (radius - bow) * nx
  const oy = my - (radius - bow) * ny

  const from = Math.atan2(sy - oy, sx - ox)
  const sweep = turn(Math.atan2(ey - oy, ex - ox) - from)
  const start = sweep > Math.PI ? Math.atan2(ey - oy, ex - ox) : from
  const span = sweep > Math.PI ? TAU - sweep : sweep

  return (x, y) => {
    if (Math.hypot(x - sx, y - sy) <= stroke) return true
    if (Math.hypot(x - ex, y - ey) <= stroke) return true
    if (Math.abs(Math.hypot(x - ox, y - oy) - radius) > stroke) return false
    return turn(Math.atan2(y - oy, x - ox) - start) <= span
  }
}

export type MarkOptions = {
  /** Stroke half-width as a fraction of the canvas. */
  readonly strokeRatio?: number
  /**
   * How much of the canvas the letter is drawn across. The menubar takes the
   * whole of its own 22px and pads the glyph itself; the app icon insets the
   * letter so it sits inside its squircle rather than against the edges.
   */
  readonly scale?: number
}

export const arcK = (
  size: number,
  { strokeRatio = 0.0165, scale = 1 }: MarkOptions = {},
): Shape => {
  const centre = size / 2
  const stroke = size * strokeRatio
  const span = size * scale
  const stemX = centre + STEM_X * span
  const arms = [-TIP_Y, TIP_Y].map((rise) =>
    arcStroke(
      [stemX, centre],
      [centre + TIP_X * span, centre + rise * span],
      centre,
      span * ARM_BOW,
      stroke,
    ),
  )

  return (x, y) => {
    const top = centre - STEM_HALF * span
    const bottom = centre + STEM_HALF * span
    if (distanceToSegment(x, y, stemX, top, stemX, bottom) <= stroke)
      return true
    return arms.some((arm) => arm(x, y))
  }
}
