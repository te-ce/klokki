// Optical sizing. A stroke thin enough to look elegant at 1024px is a grey
// smudge at 16px, so weight is a function of the size the icon is *seen* at,
// not a constant. Every size is drawn at its own weight rather than downscaled
// from one master, which is what keeps the small slots crisp.

/** Stroke half-width as a fraction of the canvas, at the two anchor sizes. */
const HAIRLINE = 0.0165
const SMALL = 0.044

/** Below this the stroke stops thinning; above it, it stops thickening. */
const SMALL_AT = 32
const HAIRLINE_AT = 256

/**
 * `size` is the size the icon is displayed at in points, not the pixel size of
 * the slot: a 16pt icon on a Retina display is 32px of resolution carrying
 * 16pt of weight, so it keeps 16pt's stroke.
 */
export const appStrokeRatio = (size: number): number => {
  const span = Math.log2(HAIRLINE_AT) - Math.log2(SMALL_AT)
  const t = Math.min(
    1,
    Math.max(0, (Math.log2(size) - Math.log2(SMALL_AT)) / span),
  )
  return SMALL + (HAIRLINE - SMALL) * t
}
