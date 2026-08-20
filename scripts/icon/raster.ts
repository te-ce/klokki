// Turns a shape predicate into a bitmap. Shapes are analytic rather than paths,
// so anti-aliasing is supersampling: each pixel is probed on a grid and the
// fraction of probes inside the shape becomes its alpha.
import type { Shape } from './mark.ts'

const SAMPLES = 4

/** Fraction of one pixel covered by the shape, 0..1. */
const sample = (shape: Shape, x: number, y: number): number => {
  let hits = 0
  for (let sy = 0; sy < SAMPLES; sy++) {
    for (let sx = 0; sx < SAMPLES; sx++) {
      if (shape(x + (sx + 0.5) / SAMPLES, y + (sy + 0.5) / SAMPLES)) hits++
    }
  }
  return hits / (SAMPLES * SAMPLES)
}

/** Alpha per pixel, 0..255, row-major. */
export const coverage = (shape: Shape, size: number): Uint8Array => {
  const alpha = new Uint8Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      alpha[y * size + x] = Math.round(sample(shape, x, y) * 255)
    }
  }
  return alpha
}
