import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type KlokkiApi } from '../shared/ipc'
import type { TimerView } from '../shared/timer'

// contextIsolation is on, so this object is the renderer's entire capability set.
const api: KlokkiApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
  listPresets: () => ipcRenderer.invoke(IPC.listPresets),
  getTimerView: () => ipcRenderer.invoke(IPC.getTimerView),
  startPreset: (id) => ipcRenderer.invoke(IPC.startPreset, id),
  stopTimer: () => ipcRenderer.invoke(IPC.stopTimer),
  onTimerView: (listener) => {
    const handler = (_event: unknown, view: TimerView): void => listener(view)
    ipcRenderer.on(IPC.timerView, handler)
    // Handing back the removal is what lets a view unsubscribe on unmount
    // instead of leaving a listener on the channel for the window's lifetime.
    return () => ipcRenderer.removeListener(IPC.timerView, handler)
  },
}

contextBridge.exposeInMainWorld('klokki', api)
