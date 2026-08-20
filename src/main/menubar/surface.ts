import { Menu, Tray, nativeImage } from 'electron'
import { join } from 'node:path'
import type { MenubarAction, MenubarItem } from './model'

export type { MenubarAction, MenubarItem } from './model'

const ICON = join(import.meta.dirname, '../../resources/trayTemplate.png')

/**
 * The macOS menubar, as narrow a seam as it can be.
 *
 * Everything above this — what the title says, which items exist, when the menu
 * is worth rebuilding — is decided in `model.ts` and wired in `index.ts`, both of
 * which run under vitest. This module is the only part that cannot: it is the one
 * that touches `Tray`.
 *
 * `menuLabels` and `clickMenuItem` are here rather than derived from the model on
 * purpose. macOS exposes no way to read or click the menubar from outside the app
 * (see AGENTS.md), so the e2e suite drives the real `Menu` through these — asking
 * the model instead would only prove the model agrees with itself.
 */
export type MenubarSurface = {
  readonly setTitle: (title: string) => void
  readonly setToolTip: (tooltip: string) => void
  readonly setMenu: (
    items: readonly MenubarItem[],
    onAction: (action: MenubarAction) => void,
  ) => void
  /** Read back from the platform, not from the last value applied. */
  readonly title: () => string
  readonly menuLabels: () => readonly string[]
  readonly clickMenuItem: (label: string) => boolean
}

export const electronMenubarSurface = (): MenubarSurface => {
  const image = nativeImage.createFromPath(ICON)
  // Template images are tinted by macOS to match the menubar.
  image.setTemplateImage(true)

  const tray = new Tray(image)
  let menu: Menu | null = null

  return {
    setTitle: (title) => tray.setTitle(title),
    setToolTip: (tooltip) => tray.setToolTip(tooltip),
    setMenu: (items, onAction) => {
      menu = Menu.buildFromTemplate(
        items.map((item) =>
          item.kind === 'separator'
            ? { type: 'separator' as const }
            : item.kind === 'label'
              ? { label: item.label, enabled: false }
              : { label: item.label, click: () => onAction(item.action) },
        ),
      )
      tray.setContextMenu(menu)
    },
    title: () => tray.getTitle(),
    menuLabels: () => (menu?.items ?? []).map((item) => item.label),
    clickMenuItem: (label) => {
      const item = menu?.items.find((candidate) => candidate.label === label)
      if (!item?.click) return false
      item.click()
      return true
    },
  }
}
