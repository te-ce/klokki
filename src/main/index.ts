import { BrowserWindow, app } from 'electron'
import { electronAlertSurface } from './alert/surface'
import {
  createHistory,
  createReminderHistory,
  createSportsHistory,
} from './history'
import { electronAppInfo, electronRequestSink } from './ipc/sink'
import { createLoginItem } from './login-item'
import { electronMenubarSurface } from './menubar/surface'
import { startPresetById } from './presets/start'
import { createPresetStore } from './presets/store'
import { createReminderRunStore } from './reminders/run-store'
import { createReminderService } from './reminders/service'
import { electronReminderAlertSurface } from './reminders/surface'
import { createReminderStore } from './reminders/store'
import { createSportRunStore } from './sports/run-store'
import { createSportsService } from './sports/service'
import { electronSportsAlertSurface } from './sports/surface'
import { createSportStore } from './sports/store'
import { createTimerService, type TimerService } from './timer/service'
import { createSnapshotStore } from './timer/snapshot'
import { wireApp, type WiredApp } from './wire'
import {
  closeOverlayWindow,
  closeReminderOverlayWindow,
  closeSportsOverlayWindow,
  openSettingsWindow,
  overlayState,
} from './windows'

/**
 * Electron exposes no way to inspect the menubar from outside the app, so the
 * e2e suite gets an explicit seam instead of asserting on screenshots. Every
 * accessor here reads the real thing — the menubar's own title, the real menu
 * template, the live overlay window.
 */
const exposeTestSeam = (
  wired: WiredApp,
  service: TimerService,
  start: (id: string) => void,
): void => {
  if (process.env['KLOKKI_E2E'] !== '1') return
  Object.assign(globalThis, {
    __klokkiTest: {
      trayTitle: () => wired.menubar.title(),
      clickMenuItem: (label: string) => wired.menubar.clickMenuItem(label),
      menuLabels: () => wired.menubar.menuLabels(),
      view: () => service.getView(),
      startPreset: start,
      stop: () => service.stop(),
      skip: () => service.skip(),
      subscriberCount: () => wired.broadcaster.targetCount(),
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
    const reminderHistory = createReminderHistory(app.getPath('userData'))
    const snapshot = createSnapshotStore(app.getPath('userData'))
    const service = createTimerService()
    const reminderStore = createReminderStore(app.getPath('userData'))
    const reminderService = createReminderService()
    const reminderRunStore = createReminderRunStore(app.getPath('userData'))
    const sportsHistory = createSportsHistory(app.getPath('userData'))
    const sportsStore = createSportStore(app.getPath('userData'))
    const sportsService = createSportsService()
    const sportsRunStore = createSportRunStore(app.getPath('userData'))

    const wired = wireApp({
      service,
      store,
      history,
      reminderHistory,
      snapshot,
      reminderStore,
      reminderService,
      reminderRunStore,
      sportsHistory,
      sportsStore,
      sportsService,
      sportsRunStore,
      loginItem: createLoginItem(app),
      requests: electronRequestSink(),
      appInfo: electronAppInfo,
      menubar: electronMenubarSurface(),
      alerts: electronAlertSurface(),
      overlay: { close: closeOverlayWindow },
      reminderAlerts: electronReminderAlertSurface(),
      reminderOverlay: { close: closeReminderOverlayWindow },
      sportsAlerts: electronSportsAlertSurface(),
      sportsOverlay: { close: closeSportsOverlayWindow },
      windows: {
        onOpened: (listener) => {
          app.on('browser-window-created', (_event, window) => {
            // Captured now: by the time 'closed' fires the window is destroyed,
            // and reading `window.webContents` then throws "Object has been
            // destroyed".
            const { webContents } = window
            listener({
              target: webContents,
              onClosed: (onClosed) => window.on('closed', onClosed),
            })
          })
        },
      },
      openSettings: openSettingsWindow,
      quit: () => app.quit(),
    })

    exposeTestSeam(wired, service, (id) => startPresetById(service, store, id))

    app.on('will-quit', () => wired.dispose())
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
