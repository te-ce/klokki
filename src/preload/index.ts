import { contextBridge, ipcRenderer } from 'electron'
import { IPC, PUSH, type KlokkiApi } from '../shared/ipc'
import type { Preset } from '../shared/preset'
import type { ReminderDefinition } from '../shared/reminder'
import type { TimerView } from '../shared/timer'

/**
 * Subscribes to one of main's push channels.
 *
 * Handing back the removal is what lets a view unsubscribe on unmount instead of
 * leaving a listener on the channel for the window's lifetime.
 */
const on = <T>(
  channel: string,
  listener: (payload: T) => void,
): (() => void) => {
  const handler = (_event: unknown, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

// contextIsolation is on, so this object is the renderer's entire capability set.
const api: KlokkiApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
  listPresets: () => ipcRenderer.invoke(IPC.listPresets),
  getTimerView: () => ipcRenderer.invoke(IPC.getTimerView),
  getStats: () => ipcRenderer.invoke(IPC.getStats),
  startPreset: (id) => ipcRenderer.invoke(IPC.startPreset, id),
  stopTimer: () => ipcRenderer.invoke(IPC.stopTimer),
  skipPhase: () => ipcRenderer.invoke(IPC.skipPhase),
  setRemaining: (targetMs) => ipcRenderer.invoke(IPC.setRemaining, targetMs),
  addTime: (extraMs) => ipcRenderer.invoke(IPC.addTime, extraMs),
  dismissAlert: () => ipcRenderer.invoke(IPC.dismissAlert),
  snoozeAlert: () => ipcRenderer.invoke(IPC.snoozeAlert),
  savePreset: (preset) => ipcRenderer.invoke(IPC.savePreset, preset),
  deletePreset: (id) => ipcRenderer.invoke(IPC.deletePreset, id),
  getLaunchAtLogin: () => ipcRenderer.invoke(IPC.getLaunchAtLogin),
  setLaunchAtLogin: (enabled) =>
    ipcRenderer.invoke(IPC.setLaunchAtLogin, enabled),
  listReminders: () => ipcRenderer.invoke(IPC.listReminders),
  saveReminder: (definition) =>
    ipcRenderer.invoke(IPC.saveReminder, definition),
  deleteReminder: (id) => ipcRenderer.invoke(IPC.deleteReminder, id),
  setReminderEnabled: (id, enabled) =>
    ipcRenderer.invoke(IPC.setReminderEnabled, id, enabled),
  snoozeReminder: (extraMs) => ipcRenderer.invoke(IPC.snoozeReminder, extraMs),
  completeReminder: (quantity) =>
    ipcRenderer.invoke(IPC.completeReminder, quantity),
  onTimerView: (listener) => on<TimerView>(PUSH.timerView, listener),
  onPresets: (listener) => on<readonly Preset[]>(PUSH.presets, listener),
  onHistoryChanged: (listener) => on(PUSH.historyChanged, listener),
  onReminders: (listener) =>
    on<readonly ReminderDefinition[]>(PUSH.reminders, listener),
}

contextBridge.exposeInMainWorld('klokki', api)
