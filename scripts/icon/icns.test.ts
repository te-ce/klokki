import { describe, expect, it } from 'vitest'
import { ICON_SLOTS, encodeIcns } from './icns.ts'

/** Walks the container per the format: magic, total length, then entries. */
const parse = (icns: Buffer) => {
  expect(icns.toString('ascii', 0, 4)).toBe('icns')
  expect(icns.readUInt32BE(4)).toBe(icns.length)
  const entries: { type: string; payload: Buffer }[] = []
  let at = 8
  while (at < icns.length) {
    const type = icns.toString('ascii', at, at + 4)
    const length = icns.readUInt32BE(at + 4)
    entries.push({ type, payload: icns.subarray(at + 8, at + length) })
    at += length
  }
  expect(at).toBe(icns.length)
  return entries
}

describe('encodeIcns', () => {
  it('carries each entry back out under its own type', () => {
    const icns = encodeIcns([
      { type: 'ic07', png: Buffer.from('first-payload') },
      { type: 'ic08', png: Buffer.from('second') },
    ])
    expect(parse(icns).map((e) => [e.type, e.payload.toString()])).toEqual([
      ['ic07', 'first-payload'],
      ['ic08', 'second'],
    ])
  })

  it('declares its own total length, which is what makes it readable', () => {
    const icns = encodeIcns([{ type: 'ic09', png: Buffer.alloc(1000, 7) }])
    expect(icns.readUInt32BE(4)).toBe(icns.length)
    expect(icns.length).toBe(8 + 8 + 1000)
  })

  it('rejects a type that is not four characters', () => {
    expect(() => encodeIcns([{ type: 'ic1', png: Buffer.alloc(1) }])).toThrow(
      /four/,
    )
  })
})

describe('ICON_SLOTS', () => {
  it('covers every size macOS asks an app icon for', () => {
    expect(ICON_SLOTS.map((s) => s.type).sort()).toEqual([
      'ic07',
      'ic08',
      'ic09',
      'ic10',
      'ic11',
      'ic12',
      'ic13',
      'ic14',
      'icp4',
      'icp5',
    ])
  })

  it('names each slot once', () => {
    expect(new Set(ICON_SLOTS.map((s) => s.type)).size).toBe(ICON_SLOTS.length)
  })

  it('renders every slot at one or two pixels per point', () => {
    for (const { type, pixels, points } of ICON_SLOTS) {
      expect([1, 2], `${type} scale`).toContain(pixels / points)
    }
  })

  it('includes both a 1x and a 2x slot for the sizes that have them', () => {
    // 32px appears twice on purpose: as a 32pt icon, and as a 16pt Retina one.
    // They are different artwork, which is the reason optical sizing exists.
    const at32 = ICON_SLOTS.filter((s) => s.pixels === 32)
    expect(at32.map((s) => s.points).sort((a, b) => a - b)).toEqual([16, 32])
  })

  it('tops out at 1024 pixels and bottoms out at 16', () => {
    const pixels = ICON_SLOTS.map((s) => s.pixels)
    expect(Math.max(...pixels)).toBe(1024)
    expect(Math.min(...pixels)).toBe(16)
  })
})
