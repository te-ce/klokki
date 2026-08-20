import { BrowserWindow, app } from 'electron'
import { presentAlert } from './alert/present'
import { wireAlerts } from './alert/wire'
import { createHistory } from './history'
import { recordHistory } from './history/record'
import { createViewBroadcaster, type ViewBroadcaster } from './ipc/broadcast'
import { registerIpc } from './ipc'
import { createLoginItem } from './login-item'
import { startPresetById } from './presets/start'
import { createPresetStore, type PresetStore } from './presets/store'
import { createTray, type TrayHandle } from './tray'
import { createTimerService, type TimerService } from './timer/service'
import { overlayState } from './windows'

/**
 * Every window is a subscriber for as long as it exists, and stops being one the
 * moment it closes. Registering here rather than in windows.ts means a window
 * added later cannot forget to do it.
 */
const pushUpdatesToWindows = (broadcaster: ViewBroadcaster): void => {
  app.on('browser-window-created', (_event, window) => {
    // Captured now: by the time 'closed' fires the window is destroyed, and
    // reading `window.webContents` then throws "Object has been destroyed".
    const { webContents } = window
    broadcaster.register(webContents)
    window.on('closed', () => broadcaster.unregister(webContents))
  })
}

/**
 * Electron exposes no way to inspect the menubar from outside the app, so the
 * e2e suite gets an explicit seam instead of asserting on screenshots.
 */
const exposeTestSeam = (
  tray: TrayHandle,
  service: TimerService,
  store: PresetStore,
  broadcaster: ViewBroadcaster,
): void => {
  if (process.env['KLOKKI_E2E'] !== '1') return
  Object.assign(globalThis, {
    __klokkiTest: {
      trayTitle: () => tray.tray.getTitle(),
      clickMenuItem: (label: string) => tray.clickMenuItem(label),
      menuLabels: () => tray.menuLabels(),
      view: () => service.getView(),
      startPreset: (id: string) => startPresetById(service, store, id),
      stop: () => service.stop(),
      subscriberCount: () => broadcaster.targetCount(),
      overlay: () => overlayState(),
    },
  })
}

const bootstrap = (): void => {
  void app.whenReady().then(() => {
    // No Dock icon, no app-switcher entry — the tray is the whole app.
    app.dock?.hide()

    const store = createPresetStore(app.getPath('userData'))
    const history = createHistory(app.getPath('userData'))
    const service = createTimerService()
    const broadcaster = createViewBroadcaster(service)

    registerIpc(service, store, createLoginItem(app), history)
    pushUpdatesToWindows(broadcaster)
    wireAlerts(service, presentAlert)
    recordHistory(service, history.append)

    const tray = createTray(service, store)
    exposeTestSeam(tray, service, store, broadcaster)

    app.on('will-quit', () => {
      broadcaster.dispose()
      service.dispose()
    })
  })

  // Closing the settings window must not quit a menubar app.
  app.on('window-all-closed', () => {})

  app.on('second-instance', () => {
    BrowserWindow.getAllWindows()[0]?.show()
  })
}

// A second instance would mean a second tray icon and a second timer. The loser
// must not continue booting: app.quit() is asynchronous, so without returning
// here it would still build a tray inside an app that is on its way out.
if (app.requestSingleInstanceLock()) {
  bootstrap()
} else {
  app.quit()
}
