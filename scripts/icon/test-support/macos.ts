import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const SIPS = '/usr/bin/sips'
const ICONUTIL = '/usr/bin/iconutil'

/**
 * The two decoders macOS ships, and whether this machine has them.
 *
 * The PNG and ICNS encoders are written out in this repo rather than pulled from
 * an image library (see AGENTS.md), so the tests that matter most ask an outside
 * decoder whether the bytes are a file the platform accepts — the one check an
 * encoder cannot make about itself. Both decoders are macOS's own, and CI runs
 * everything platform-independent on Linux: there, there is no second opinion to
 * get, so those tests say they were skipped rather than failing on a missing
 * binary. What the bytes are is still pinned, chunk by chunk, by the tests around
 * them, and the macOS job runs the whole suite with both decoders present.
 */
export const hasSips = existsSync(SIPS)
export const hasIconutil = existsSync(ICONUTIL)

/** `sips -g` for one file, as it prints it. */
export const sipsProperties = (
  path: string,
  ...properties: readonly string[]
): string =>
  execFileSync(
    SIPS,
    properties.flatMap((property) => ['-g', property]).concat(path),
    { encoding: 'utf8' },
  )

/** Unpacks an `.icns` into an iconset directory, which only macOS can do. */
export const unpackIconset = (icns: string, into: string): void => {
  execFileSync(ICONUTIL, ['-c', 'iconset', icns, '-o', into])
}
