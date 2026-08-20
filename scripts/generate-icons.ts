// Draws every icon the app ships, so the repo carries no opaque binary assets:
//
//   pnpm icons
//
// Writes the menubar templates into resources/ (committed, loaded at runtime)
// and build/icon.icns for electron-builder (generated at package time).
import { relative, resolve } from 'node:path'
import { generateIcons } from './icon/generate.ts'

const root = resolve(import.meta.dirname, '..')
for (const path of generateIcons(root)) {
  console.warn(`wrote ${relative(root, path)}`)
}
