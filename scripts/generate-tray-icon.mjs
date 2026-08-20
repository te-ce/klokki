// Generates the macOS menubar template images from code, so the repo carries no
// opaque binary assets. Template images must be black + alpha only; macOS tints
// them for light/dark menubars.
//
//   pnpm icons  ->  resources/trayTemplate.png (22px), resources/trayTemplate@2x.png (44px)
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

const crc32 = (buf) => {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** Encodes an 8-bit grayscale+alpha bitmap as a PNG. */
const encodePng = (size, pixels) => {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 4 // color type: grayscale + alpha
  const raw = Buffer.alloc(size * (size * 2 + 1))
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 2 + 1)
    raw[rowStart] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      raw[rowStart + 1 + x * 2] = 0 // black
      raw[rowStart + 2 + x * 2] = pixels[y * size + x]
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const distanceToSegment = (px, py, ax, ay, bx, by) => {
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

/** A clock face: ring plus an hour and a minute hand. */
const covers = (x, y, size) => {
  const c = size / 2
  const radius = size * 0.4
  const stroke = size * 0.085
  const ring = Math.abs(Math.hypot(x - c, y - c) - radius) <= stroke
  const hourHand = distanceToSegment(x, y, c, c, c, c - radius * 0.55) <= stroke
  const minuteHand =
    distanceToSegment(x, y, c, c, c + radius * 0.62, c) <= stroke
  return ring || hourHand || minuteHand
}

const SAMPLES = 4

/** Supersampled coverage of one pixel, 0..255 — cheap anti-aliasing. */
const alphaAt = (x, y, size) => {
  let hits = 0
  for (let sy = 0; sy < SAMPLES; sy++) {
    for (let sx = 0; sx < SAMPLES; sx++) {
      if (covers(x + (sx + 0.5) / SAMPLES, y + (sy + 0.5) / SAMPLES, size))
        hits++
    }
  }
  return Math.round((hits / (SAMPLES * SAMPLES)) * 255)
}

const render = (size) => {
  const pixels = new Uint8Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      pixels[y * size + x] = alphaAt(x, y, size)
    }
  }
  return pixels
}

const targets = [
  ['resources/trayTemplate.png', 22],
  ['resources/trayTemplate@2x.png', 44],
]

for (const [path, size] of targets) {
  const absolute = resolve(import.meta.dirname, '..', path)
  mkdirSync(dirname(absolute), { recursive: true })
  writeFileSync(absolute, encodePng(size, render(size)))
  console.warn(`wrote ${path} (${size}x${size})`)
}
