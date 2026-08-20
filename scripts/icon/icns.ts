// The .icns container. It is a header plus a flat list of typed entries, and
// every entry macOS wants from a modern icon may be a PNG — so this is written
// here rather than shelling out to iconutil, which keeps `pnpm icons` runnable
// anywhere and the encoding under test.

/**
 * One entry in the icon family. `pixels` is the resolution to render at,
 * `points` the size the slot is displayed at — they differ for the @2x slots,
 * and the mark's stroke follows the points.
 */
export type IconSlot = {
  readonly type: string
  readonly pixels: number
  readonly points: number
}

/**
 * The slots macOS reads for an app icon, at 1x and 2x. Two slots can share a
 * pixel size while differing in points (32px is both a 32pt icon and a 16pt
 * Retina one); they are drawn separately, at their own optical weight.
 */
export const ICON_SLOTS: readonly IconSlot[] = [
  { type: 'icp4', pixels: 16, points: 16 },
  { type: 'icp5', pixels: 32, points: 32 },
  { type: 'ic11', pixels: 32, points: 16 },
  { type: 'ic12', pixels: 64, points: 32 },
  { type: 'ic07', pixels: 128, points: 128 },
  { type: 'ic13', pixels: 256, points: 128 },
  { type: 'ic08', pixels: 256, points: 256 },
  { type: 'ic14', pixels: 512, points: 256 },
  { type: 'ic09', pixels: 512, points: 512 },
  { type: 'ic10', pixels: 1024, points: 512 },
]

export type IcnsEntry = {
  readonly type: string
  readonly png: Buffer
}

const HEADER_BYTES = 8
const ENTRY_HEADER_BYTES = 8

export const encodeIcns = (entries: readonly IcnsEntry[]): Buffer => {
  const chunks = entries.map(({ type, png }) => {
    if (type.length !== 4) {
      throw new Error(`icns entry type must be four characters, got "${type}"`)
    }
    const header = Buffer.alloc(ENTRY_HEADER_BYTES)
    header.write(type, 0, 4, 'ascii')
    header.writeUInt32BE(ENTRY_HEADER_BYTES + png.length, 4)
    return Buffer.concat([header, png])
  })

  const body = Buffer.concat(chunks)
  const header = Buffer.alloc(HEADER_BYTES)
  header.write('icns', 0, 4, 'ascii')
  header.writeUInt32BE(HEADER_BYTES + body.length, 4)
  return Buffer.concat([header, body])
}
