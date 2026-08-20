import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { alertRoute, type Alert } from '../shared/alert'
import {
  reminderAlertRoute,
  type ReminderAlert,
} from '../shared/reminder-alert'

const PRELOAD = join(import.meta.dirname, '../preload/index.js')
const RENDERER_HTML = join(import.meta.dirname, '../renderer/index.html')
const DEV_SERVER_URL = process.env['ELECTRON_RENDERER_URL']
// macOS has no headless Electron, so the e2e suite keeps windows unshown
// instead: the renderer still loads and runs, it just never steals focus.
const HEADLESS = process.env['KLOKKI_E2E'] === '1'

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

  if (!HEADLESS)
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

let overlayWindow: BrowserWindow | null = null

/**
 * The overlay that makes a phase change impossible to miss.
 *
 * Every option here is load-bearing, and together they are the substance of the
 * feature (see AGENTS.md):
 *
 * - `screen-saver` is the only always-on-top level that sits above a fullscreen
 *   window, which is exactly where a notification is silently swallowed.
 * - `setVisibleOnAllWorkspaces` with `visibleOnFullScreen` puts it on whichever
 *   Space is active, rather than politely waiting on the one it was created on.
 * - `focusable: false` plus `showInactive()` keep the user's keystrokes going to
 *   whatever they were typing in. Mouse clicks still land, so Dismiss works.
 * - `skipTaskbar`, with the Dock already hidden, keeps Klokki a menubar app: an
 *   overlay must not put it in the app switcher.
 */
export const openOverlayWindow = (alert: Alert): void => {
  // A new phase supersedes the last one: two stacked overlays would each need
  // dismissing, and the older one names a transition already gone by.
  closeOverlayWindow()

  overlayWindow = new BrowserWindow({
    width: 420,
    height: 260,
    center: true,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: HARDENED_WEB_PREFERENCES,
  })

  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (!HEADLESS)
    overlayWindow.on('ready-to-show', () => overlayWindow?.showInactive())
  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  loadRenderer(overlayWindow, alertRoute(alert))
}

/** Acknowledgement is the only thing that closes it; there is no timer. */
export const closeOverlayWindow = (): void => {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close()
  overlayWindow = null
}

let reminderOverlayWindow: BrowserWindow | null = null

/**
 * The reminder overlay — same intrusive-alert platform config as the phase
 * overlay (see openOverlayWindow), kept as its own window so a reminder due
 * mid-transition never fights the phase overlay for the same window.
 */
export const openReminderOverlayWindow = (alert: ReminderAlert): void => {
  closeReminderOverlayWindow()

  reminderOverlayWindow = new BrowserWindow({
    width: 420,
    height: 260,
    center: true,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: HARDENED_WEB_PREFERENCES,
  })

  reminderOverlayWindow.setAlwaysOnTop(true, 'screen-saver')
  reminderOverlayWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  })

  if (!HEADLESS)
    reminderOverlayWindow.on('ready-to-show', () =>
      reminderOverlayWindow?.showInactive(),
    )
  reminderOverlayWindow.on('closed', () => {
    reminderOverlayWindow = null
  })

  loadRenderer(reminderOverlayWindow, reminderAlertRoute(alert))
}

/** Answering the overlay is the only thing that closes it; there is no timer. */
export const closeReminderOverlayWindow = (): void => {
  if (reminderOverlayWindow && !reminderOverlayWindow.isDestroyed())
    reminderOverlayWindow.close()
  reminderOverlayWindow = null
}

/** The e2e suite's view of the overlay — the platform config is the feature. */
export const overlayState = (): {
  open: boolean
  alwaysOnTop: boolean
  focusable: boolean
  visibleOnAllWorkspaces: boolean
} | null => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return null
  return {
    open: true,
    alwaysOnTop: overlayWindow.isAlwaysOnTop(),
    focusable: overlayWindow.isFocusable(),
    visibleOnAllWorkspaces: overlayWindow.isVisibleOnAllWorkspaces(),
  }
}
