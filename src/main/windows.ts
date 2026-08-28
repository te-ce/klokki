import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import { alertRoute, type Alert } from '../shared/alert'
import {
  OVERLAY_WIDTH,
  sportsOverlayHeight,
  transitionOverlayHeight,
} from '../shared/overlay-size'
import { sportsAlertRoute, type SportsAlert } from '../shared/sports-alert'

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

type OverlayState = {
  open: boolean
  alwaysOnTop: boolean
  focusable: boolean
  visibleOnAllWorkspaces: boolean
  movable: boolean
}

/**
 * An intrusive alert window — the platform config that makes a boundary
 * impossible to miss, shared by the phase overlay and the Sports overlay.
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
 *   The Sports overlay opts out of this (`focusable: true`, shown with
 *   `show()`) because it is the one overlay that asks for typed input — a
 *   quantity per activity — and a window that can never become key can never
 *   receive it.
 * - `skipTaskbar`, with the Dock already hidden, keeps Klokki a menubar app: an
 *   overlay must not put it in the app switcher.
 * - `movable: true` is the one option here that isn't about being impossible to
 *   miss — a frameless, centred window has no OS-drawn titlebar to drag by, so
 *   without it an overlay that lands over whatever the user was reading is
 *   stuck there. Dragging does not fight any of the above: the window stays
 *   always-on-top, unfocusable (or focusable), off the taskbar and on every
 *   Space regardless of where the user has put it on screen.
 *
 * The height comes from the caller (`src/shared/overlay-size.ts`) because it is
 * a fact about the alert, not about the platform: Sports asks about every
 * activity at once, and one fixed height either clipped that behind a scrollbar
 * or left the phase overlay half empty.
 */
const createOverlay = (
  options: { focusable?: boolean } = {},
): {
  readonly open: (route: string, height: number) => void
  readonly close: () => void
  readonly state: () => OverlayState | null
} => {
  const focusable = options.focusable ?? false
  let window: BrowserWindow | null = null

  const close = (): void => {
    if (window && !window.isDestroyed()) window.close()
    window = null
  }

  const open = (route: string, height: number): void => {
    // A new boundary supersedes the last one: two stacked overlays would each
    // need dismissing, and the older one names a transition already gone by.
    close()

    window = new BrowserWindow({
      width: OVERLAY_WIDTH,
      height,
      center: true,
      show: false,
      frame: false,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable,
      skipTaskbar: true,
      alwaysOnTop: true,
      webPreferences: HARDENED_WEB_PREFERENCES,
    })

    window.setAlwaysOnTop(true, 'screen-saver')
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    if (!HEADLESS) {
      window.on('ready-to-show', () =>
        focusable ? window?.show() : window?.showInactive(),
      )
    }
    window.on('closed', () => {
      window = null
    })

    loadRenderer(window, route)
  }

  const state = (): OverlayState | null => {
    if (!window || window.isDestroyed()) return null
    return {
      open: true,
      alwaysOnTop: window.isAlwaysOnTop(),
      focusable: window.isFocusable(),
      visibleOnAllWorkspaces: window.isVisibleOnAllWorkspaces(),
      movable: window.isMovable(),
    }
  }

  return { open, close, state }
}

const phaseOverlay = createOverlay()

export const openOverlayWindow = (alert: Alert): void =>
  phaseOverlay.open(alertRoute(alert), transitionOverlayHeight())

/** Acknowledgement is the only thing that closes it; there is no timer. */
export const closeOverlayWindow = (): void => phaseOverlay.close()

/** The e2e suite's view of the overlay — the platform config is the feature. */
export const overlayState = (): OverlayState | null => phaseOverlay.state()

const sportsOverlay = createOverlay({ focusable: true })

/**
 * The Sports overlay — same intrusive-alert platform config as the phase
 * overlay, kept as its own window so a Sports firing mid-transition never
 * fights the phase overlay for the same window. Focusable because it is the
 * one overlay that asks for typed input, a quantity per activity.
 */
export const openSportsOverlayWindow = (alert: SportsAlert): void =>
  sportsOverlay.open(
    sportsAlertRoute(alert),
    sportsOverlayHeight(
      alert.activities.length,
      screen.getPrimaryDisplay().workAreaSize.height,
    ),
  )

/** Answering the overlay is the only thing that closes it; there is no timer. */
export const closeSportsOverlayWindow = (): void => sportsOverlay.close()
