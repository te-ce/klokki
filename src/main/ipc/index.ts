import { app, ipcMain } from 'electron'
import { IPC, type AppInfo } from '../../shared/ipc'
import type { Preset } from '../../shared/preset'
import type { LoginItem } from '../login-item'
import { startPresetById } from '../presets/start'
import type { PresetStore } from '../presets/store'
import type { TimerService } from '../timer/service'
import { closeOverlayWindow } from '../windows'

/** The main side of src/shared/ipc.ts. Every renderer capability lands here. */
export const registerIpc = (
  service: TimerService,
  store: PresetStore,
  loginItem: LoginItem,
): void => {
  ipcMain.handle(IPC.getAppInfo, (): AppInfo => ({
    version: app.getVersion(),
    electron: process.versions.electron,
  }))
  // The store is read per call, not captured: a window that has been open across
  // an edit must not be answered from a stale list.
  ipcMain.handle(IPC.listPresets, () => store.list())
  ipcMain.handle(IPC.getTimerView, () => service.getView())
  ipcMain.handle(IPC.startPreset, (_event, id: string) =>
    startPresetById(service, store, id),
  )
  ipcMain.handle(IPC.stopTimer, () => service.stop())
  ipcMain.handle(IPC.dismissAlert, () => closeOverlayWindow())
  ipcMain.handle(IPC.snoozeAlert, () => {
    service.snooze()
    closeOverlayWindow()
  })
  ipcMain.handle(IPC.savePreset, (_event, preset: Preset) => store.save(preset))
  ipcMain.handle(IPC.deletePreset, (_event, id: string) => store.remove(id))
  ipcMain.handle(IPC.getLaunchAtLogin, () => loginItem.isEnabled())
  ipcMain.handle(IPC.setLaunchAtLogin, (_event, enabled: boolean) =>
    loginItem.setEnabled(enabled),
  )
}
