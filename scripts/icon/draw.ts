// Composites the mark onto its ground: an alpha-only glyph for the menubar,
// and a full-colour squircle for the app icon.
import { RING_RADIUS, clockMark, squircle } from './mark.ts'
import { appStrokeRatio } from './optical.ts'
import { coverage } from './raster.ts'

/**
 * The menubar glyph's weight. Nothing about it is optical: it is the weight
 * that survives 22 pixels, and the app icon deliberately does not share it.
 * At 22px this is a 2px stroke — heavy enough to hold its colour against the
 * menubar, thin enough that the ring and the K inside it stay separate shapes
 * rather than closing into a filled disc.
 */
const TRAY_RING_RADIUS = 0.42
const TRAY_STROKE_RATIO = 0.045

export type Palette = {
  /** Top and bottom of the ground's vertical fall, as [r, g, b]. */
  readonly top: readonly [number, number, number]
  readonly bottom: readonly [number, number, number]
  /** The mark itself. */
  readonly mark: readonly [number, number, number]
}

/** #26242E falling to #141317, with a white mark. */
export const INK: Palette = {
  top: [0x26, 0x24, 0x2e],
  bottom: [0x14, 0x13, 0x17],
  mark: [0xff, 0xff, 0xff],
}

/**
 * A macOS template image: black plus alpha, so the system can tint it for a
 * light or dark menubar. Only the alpha channel carries the shape, which is
 * why this returns one byte per pixel.
 *
 * The ring is unbroken here. At 22px a notch is narrower than the stroke around
 * it, so it would read as a smudge rather than a gap.
 */
export const drawTemplate = (size: number): Uint8Array =>
  coverage(
    clockMark(size, {
      notched: false,
      ringRadius: TRAY_RING_RADIUS,
      strokeRatio: TRAY_STROKE_RATIO,
    }),
    size,
  )

/**
 * One row of the background gradient, as RGB.
 *
 * Channel indices are 0-2 and every palette entry is an RGB triple, so the
 * fallbacks are unreachable — they are here so nothing is asserted.
 */
const gradientRow = (palette: Palette, fall: number): number[] =>
  [0, 1, 2].map((i) => {
    const top = palette.top[i] ?? 0
    const bottom = palette.bottom[i] ?? 0
    return top + (bottom - top) * fall
  })

/** The mark laid over the gradient at `ink` opacity, as one RGB byte. */
const blend = (base: number, mark: number, ink: number): number =>
  Math.round(base + (mark - base) * ink)

/**
 * One pixel's three colour bytes, written in place.
 *
 * Channel indices are 0-2 and both arguments are RGB triples, so the fallbacks
 * are unreachable — they are here so nothing is asserted.
 */
const writeRgb = (
  out: Uint8Array,
  offset: number,
  row: readonly number[],
  mark: readonly number[],
  ink: number,
): void => {
  for (let i = 0; i < 3; i++)
    out[offset + i] = blend(row[i] ?? 0, mark[i] ?? 0, ink)
}

/**
 * The app icon as RGBA.
 *
 * `pixels` is the resolution to render at; `points` is the size the slot is
 * *seen* at. They differ for every @2x slot, and the stroke follows the points
 * so a 16pt icon keeps 16pt's weight whether or not the display is Retina.
 */
export const drawAppIcon = (
  pixels: number,
  points: number,
  palette: Palette = INK,
): Uint8Array => {
  const ground = coverage(squircle(pixels), pixels)
  const mark = coverage(
    clockMark(pixels, {
      ringRadius: RING_RADIUS,
      strokeRatio: appStrokeRatio(points),
    }),
    pixels,
  )
  const out = new Uint8Array(pixels * pixels * 4)
  for (let y = 0; y < pixels; y++) {
    const fall = pixels === 1 ? 0 : y / (pixels - 1)
    const row = gradientRow(palette, fall)
    for (let x = 0; x < pixels; x++) {
      const index = y * pixels + x
      const alpha = ground[index] ?? 0
      if (alpha === 0) continue
      const ink = (mark[index] ?? 0) / 255
      const offset = index * 4
      writeRgb(out, offset, row, palette.mark, ink)
      out[offset + 3] = alpha
    }
  }
  return out
}
