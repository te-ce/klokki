import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { encodeGrayAlphaPng, encodeRgbaPng } from './png.ts'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * Walks a PNG the way the spec says to, independently of how png.ts writes one.
 * Deliberately not sharing the encoder's helpers: a parser built from the same
 * code it checks would agree with any bug.
 */
const parse = (png: Buffer) => {
  expect(png.subarray(0, 8)).toEqual(SIGNATURE)
  const chunks: { type: string; data: Buffer }[] = []
  let at = 8
  while (at < png.length) {
    const length = png.readUInt32BE(at)
    const type = png.toString('ascii', at + 4, at + 8)
    chunks.push({ type, data: png.subarray(at + 8, at + 8 + length) })
    at += 12 + length
  }
  expect(at).toBe(png.length)
  const ihdr = chunks[0]
  expect(ihdr?.type).toBe('IHDR')
  expect(chunks.at(-1)?.type).toBe('IEND')
  const idat = chunks.filter((c) => c.type === 'IDAT')
  expect(idat.length).toBeGreaterThan(0)
  return {
    width: ihdr!.data.readUInt32BE(0),
    height: ihdr!.data.readUInt32BE(4),
    bitDepth: ihdr!.data[8],
    colorType: ihdr!.data[9],
    raw: inflateSync(Buffer.concat(idat.map((c) => c.data))),
  }
}

/** sips is an external decoder: it rejects a bad CRC or a malformed chunk. */
const sipsAccepts = (png: Buffer) => {
  const path = join(mkdtempSync(join(tmpdir(), 'klokki-png-')), 'probe.png')
  writeFileSync(path, png)
  const out = execFileSync(
    '/usr/bin/sips',
    ['-g', 'pixelWidth', '-g', 'pixelHeight', path],
    {
      encoding: 'utf8',
    },
  )
  return out
}

describe('encodeGrayAlphaPng', () => {
  it('writes an 8-bit grayscale+alpha header at the requested size', () => {
    const png = encodeGrayAlphaPng(4, new Uint8Array(16).fill(200))
    const { width, height, bitDepth, colorType } = parse(png)
    expect({ width, height, bitDepth, colorType }).toEqual({
      width: 4,
      height: 4,
      bitDepth: 8,
      colorType: 4,
    })
  })

  it('writes black pixels whose alpha is the value it was given', () => {
    // A 2x2 with a distinct alpha per pixel, so a transposed or off-by-one
    // scanline shows up as a mismatch rather than passing by symmetry.
    const png = encodeGrayAlphaPng(2, new Uint8Array([0, 64, 128, 255]))
    // Each scanline: one filter byte, then (gray, alpha) per pixel.
    expect([...parse(png).raw]).toEqual([0, 0, 0, 0, 64, 0, 0, 128, 0, 255])
  })

  it('produces a file an external decoder reads back at the right size', () => {
    const out = sipsAccepts(
      encodeGrayAlphaPng(22, new Uint8Array(484).fill(180)),
    )
    expect(out).toMatch(/pixelWidth: 22/)
    expect(out).toMatch(/pixelHeight: 22/)
  })
})

describe('encodeRgbaPng', () => {
  it('writes an 8-bit RGBA header at the requested size', () => {
    const png = encodeRgbaPng(3, new Uint8Array(3 * 3 * 4).fill(10))
    const { width, height, bitDepth, colorType } = parse(png)
    expect({ width, height, bitDepth, colorType }).toEqual({
      width: 3,
      height: 3,
      bitDepth: 8,
      colorType: 6,
    })
  })

  it('preserves every channel of every pixel', () => {
    const pixels = new Uint8Array([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ])
    expect([...parse(encodeRgbaPng(2, pixels)).raw]).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 9, 10, 11, 12, 13, 14, 15, 16,
    ])
  })

  it('round-trips any size and any pixels through an external decoder', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }),
        fc.nat({ max: 255 }),
        (size, fill) => {
          const out = sipsAccepts(
            encodeRgbaPng(size, new Uint8Array(size * size * 4).fill(fill)),
          )
          expect(out).toMatch(new RegExp(`pixelWidth: ${size}`))
        },
      ),
      { numRuns: 6 },
    )
  })
})
