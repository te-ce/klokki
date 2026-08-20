import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type KlokkiApi } from '../shared/ipc'

// contextIsolation is on, so this object is the renderer's entire capability set.
const api: KlokkiApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
}

contextBridge.exposeInMainWorld('klokki', api)
