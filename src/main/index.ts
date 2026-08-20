import { BrowserWindow, app, ipcMain, type Tray } from 'electron'
import { IPC, type AppInfo } from '../shared/ipc'
import type { Preset } from '../shared/preset'
import { loadPresets } from './presets/store'
import { createTray } from './tray'
import { createTimerService, type TimerService } from './timer/service'

const registerIpc = (): void => {
  ipcMain.handle(IPC.getAppInfo, (): AppInfo => ({
    version: app.getVersion(),
    electron: process.versions.electron,
  }))
}

/**
 * Electron exposes no way to inspect the menubar from outside the app, so the
 * e2e suite gets an explicit seam instead of asserting on screenshots.
 */
const exposeTestSeam = (
  tray: Tray,
  service: TimerService,
  presets: readonly Preset[],
): void => {
  if (process.env['KLOKKI_E2E'] !== '1') return
  Object.assign(globalThis, {
    __klokkiTest: {
      trayTitle: () => tray.getTitle(),
      view: () => service.getView(),
      startPreset: (id: string) => {
        const preset = presets.find((candidate) => candidate.id === id)
        if (preset) service.startPreset(preset)
      },
      stop: () => service.stop(),
    },
  })
}

const bootstrap = (): void => {
  void app.whenReady().then(() => {
    // No Dock icon, no app-switcher entry — the tray is the whole app.
    app.dock?.hide()
    registerIpc()

    const presets = loadPresets(app.getPath('userData'))
    const service = createTimerService()
    const tray = createTray(service, presets)
    exposeTestSeam(tray, service, presets)

    app.on('will-quit', () => service.dispose())
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
