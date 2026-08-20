import { app, ipcMain } from 'electron'
import type { AppInfo } from '../../shared/ipc'
import type { RequestSink } from './index'

/**
 * The Electron half of the request contract.
 *
 * The event object is dropped here rather than passed on: no handler needs the
 * sender — every window has the same capabilities — and dropping it is what lets
 * `registerIpc` be driven by a fake in its own test.
 */
export const electronRequestSink = (): RequestSink => ({
  handle: (channel, handler) => {
    ipcMain.handle(channel, (_event, ...args: readonly unknown[]) =>
      handler(...args),
    )
  },
})

export const electronAppInfo = (): AppInfo => ({
  version: app.getVersion(),
  electron: process.versions.electron,
})
