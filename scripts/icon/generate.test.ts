import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateIcons } from './generate.ts'
import {
  hasIconutil,
  hasSips,
  sipsProperties,
  unpackIconset,
} from './test-support/macos.ts'

const root = mkdtempSync(join(tmpdir(), 'klokki-icons-'))
const written = generateIcons(root)

describe('generateIcons', () => {
  it('writes the menubar templates and the app icon', () => {
    expect(written.map((p) => p.replace(`${root}/`, ''))).toEqual([
      'resources/trayTemplate.png',
      'resources/trayTemplate@2x.png',
      'build/icon.icns',
    ])
    for (const path of written) expect(existsSync(path), path).toBe(true)
  })

  it.skipIf(!hasIconutil)(
    'produces an .icns that macOS itself can unpack',
    () => {
      // iconutil is the authority on this format. If it can round-trip the file
      // into an iconset, Finder and the Get Info panel can read it too.
      const out = join(root, 'unpacked.iconset')
      unpackIconset(join(root, 'build/icon.icns'), out)
      expect(readdirSync(out).sort()).toEqual([
        'icon_128x128.png',
        'icon_128x128@2x.png',
        'icon_16x16.png',
        'icon_16x16@2x.png',
        'icon_256x256.png',
        'icon_256x256@2x.png',
        'icon_32x32.png',
        'icon_32x32@2x.png',
        'icon_512x512.png',
        'icon_512x512@2x.png',
      ])
    },
  )

  it.skipIf(!hasSips)(
    'writes menubar templates at the two sizes a menubar asks for',
    () => {
      const size = (path: string) =>
        sipsProperties(path, 'pixelWidth').match(/pixelWidth: (\d+)/)?.[1]
      expect(size(join(root, 'resources/trayTemplate.png'))).toBe('22')
      expect(size(join(root, 'resources/trayTemplate@2x.png'))).toBe('44')
    },
  )

  it('keeps the templates black-and-alpha, as a template image must be', () => {
    // Colour type 4 in the IHDR: grayscale plus alpha. macOS tints template
    // images itself, and ignores any colour it finds in one.
    const png = readFileSync(join(root, 'resources/trayTemplate.png'))
    expect(png[8 + 4 + 4 + 9]).toBe(4)
  })
})
