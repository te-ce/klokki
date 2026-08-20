import { Menu, Tray, app, nativeImage } from 'electron'
import { join } from 'node:path'
import { openSettingsWindow } from './windows'

const ICON = join(import.meta.dirname, '../../resources/trayTemplate.png')

let tray: Tray | null = null

export const createTray = (): Tray => {
  const image = nativeImage.createFromPath(ICON)
  // Template images are tinted by macOS to match the menubar.
  image.setTemplateImage(true)

  tray = new Tray(image)
  tray.setToolTip('Klokki')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Settings…', click: openSettingsWindow },
      { type: 'separator' },
      { label: 'Quit Klokki', click: () => app.quit() },
    ]),
  )

  return tray
}
