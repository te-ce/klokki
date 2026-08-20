import { app, ipcMain } from 'electron'
import { IPC, type AppInfo } from '../../shared/ipc'
import type { Preset } from '../../shared/preset'
import type { TimerService } from '../timer/service'

/**
 * Starting is by id, not by preset object: a renderer only ever holds what came
 * across IPC, and an unknown id is a no-op rather than an error — the presets
 * file may have changed under an open window.
 */
export const startPresetById = (
  service: TimerService,
  presets: readonly Preset[],
  id: string,
): void => {
  const preset = presets.find((candidate) => candidate.id === id)
  if (preset) service.startPreset(preset)
}

/** The main side of src/shared/ipc.ts. Every renderer capability lands here. */
export const registerIpc = (
  service: TimerService,
  presets: readonly Preset[],
): void => {
  ipcMain.handle(IPC.getAppInfo, (): AppInfo => ({
    version: app.getVersion(),
    electron: process.versions.electron,
  }))
  ipcMain.handle(IPC.listPresets, () => presets)
  ipcMain.handle(IPC.getTimerView, () => service.getView())
  ipcMain.handle(IPC.startPreset, (_event, id: string) =>
    startPresetById(service, presets, id),
  )
  ipcMain.handle(IPC.stopTimer, () => service.stop())
}
