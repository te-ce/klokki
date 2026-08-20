import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { drawAppIcon, drawTemplate } from './draw.ts'
import { ICON_SLOTS, encodeIcns } from './icns.ts'
import { encodeGrayAlphaPng, encodeRgbaPng } from './png.ts'

/** The menubar template at 1x and 2x. 22px is the macOS menubar's icon size. */
const TRAY_SIZES = [
  ['resources/trayTemplate.png', 22],
  ['resources/trayTemplate@2x.png', 44],
] as const

const write = (path: string, bytes: Buffer): string => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, bytes)
  return path
}

/**
 * Draws every icon the app ships and returns the paths written, relative to
 * `root`. The tray templates are committed because they are loaded at runtime;
 * `build/icon.icns` is not, because electron-builder only needs it at package
 * time and this regenerates it.
 */
export const generateIcons = (root: string): string[] => {
  const written = TRAY_SIZES.map(([path, size]) =>
    write(join(root, path), encodeGrayAlphaPng(size, drawTemplate(size))),
  )

  const icns = encodeIcns(
    ICON_SLOTS.map(({ type, pixels, points }) => ({
      type,
      png: encodeRgbaPng(pixels, drawAppIcon(pixels, points)),
    })),
  )
  written.push(write(join(root, 'build/icon.icns'), icns))

  return written
}
