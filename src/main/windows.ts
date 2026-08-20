import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'

const PRELOAD = join(import.meta.dirname, '../preload/index.js')
const RENDERER_HTML = join(import.meta.dirname, '../renderer/index.html')
const DEV_SERVER_URL = process.env['ELECTRON_RENDERER_URL']

/** Security posture shared by every window: the renderer never gets Node. */
const HARDENED_WEB_PREFERENCES = {
  preload: PRELOAD,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
} as const

const loadRenderer = (window: BrowserWindow, route: string): void => {
  if (DEV_SERVER_URL) {
    void window.loadURL(`${DEV_SERVER_URL}#${route}`)
    return
  }
  void window.loadFile(RENDERER_HTML, { hash: route })
}

let settingsWindow: BrowserWindow | null = null

export const openSettingsWindow = (): void => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 620,
    title: 'Klokki',
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: HARDENED_WEB_PREFERENCES,
  })

  settingsWindow.on('ready-to-show', () => settingsWindow?.show())
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  // External links belong in the browser, never in an app window.
  settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  loadRenderer(settingsWindow, '/settings')
}
