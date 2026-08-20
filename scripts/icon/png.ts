// Minimal PNG writers. The repo carries no opaque binary assets and no image
// dependency, so the icons are drawn and encoded here: grayscale+alpha for the
// menubar templates (macOS tints them, so only alpha carries shape) and RGBA
// for the app icon.
import { deflateSync } from 'node:zlib'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

const crc32 = (bytes: Buffer): number => {
  let c = 0xffffffff
  // The index is masked to 0-255 and the table has 256 entries.
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

const ihdr = (size: number, colorType: number): Buffer => {
  const data = Buffer.alloc(13)
  data.writeUInt32BE(size, 0)
  data.writeUInt32BE(size, 4)
  data[8] = 8 // bit depth
  data[9] = colorType
  return data // compression, filter and interlace all stay 0
}

/** Wraps already-filtered scanlines (each prefixed with a 0 filter byte). */
const assemble = (size: number, colorType: number, raw: Buffer): Buffer =>
  Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr(size, colorType)),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])

/** `alpha` is one byte per pixel, row-major. Every pixel is black. */
export const encodeGrayAlphaPng = (size: number, alpha: Uint8Array): Buffer => {
  const stride = size * 2
  const raw = Buffer.alloc(size * (stride + 1))
  for (let y = 0; y < size; y++) {
    const row = y * (stride + 1)
    for (let x = 0; x < size; x++) {
      raw[row + 2 + x * 2] = alpha[y * size + x] ?? 0
    }
  }
  return assemble(size, 4, raw)
}

/** `pixels` is four bytes per pixel (r, g, b, a), row-major. */
export const encodeRgbaPng = (size: number, pixels: Uint8Array): Buffer => {
  const stride = size * 4
  const raw = Buffer.alloc(size * (stride + 1))
  for (let y = 0; y < size; y++) {
    Buffer.from(pixels.subarray(y * stride, (y + 1) * stride)).copy(
      raw,
      y * (stride + 1) + 1,
    )
  }
  return assemble(size, 6, raw)
}
