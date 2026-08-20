import { BrowserWindow, app, ipcMain } from 'electron'
import { IPC, type AppInfo } from '../shared/ipc'
import { createTray } from './tray'

// Menubar-resident app: a second instance would mean a second tray icon and a
// second timer, so the first instance wins and later launches just surface it.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

const registerIpc = (): void => {
  ipcMain.handle(IPC.getAppInfo, (): AppInfo => ({
    version: app.getVersion(),
    electron: process.versions.electron,
  }))
}

void app.whenReady().then(() => {
  // No Dock icon, no app-switcher entry — the tray is the whole app.
  app.dock?.hide()
  registerIpc()
  createTray()
})

// Closing the settings window must not quit a menubar app.
app.on('window-all-closed', () => {})

app.on('second-instance', () => {
  BrowserWindow.getAllWindows()[0]?.show()
})
