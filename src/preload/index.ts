import { contextBridge, ipcRenderer } from 'electron'
import { IPC, PUSH, type KlokkiApi } from '../shared/ipc'
import type { Preset } from '../shared/preset'
import type { SportsView } from '../shared/sport'
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
  stopTimer: (runId) => ipcRenderer.invoke(IPC.stopTimer, runId),
  skipPhase: (runId) => ipcRenderer.invoke(IPC.skipPhase, runId),
  confirmNext: (runId) => ipcRenderer.invoke(IPC.confirmNext, runId),
  setRemaining: (runId, targetMs) =>
    ipcRenderer.invoke(IPC.setRemaining, runId, targetMs),
  addTime: (runId, extraMs) => ipcRenderer.invoke(IPC.addTime, runId, extraMs),
  dismissAlert: (runId) => ipcRenderer.invoke(IPC.dismissAlert, runId),
  stopFromAlert: (runId) => ipcRenderer.invoke(IPC.stopFromAlert, runId),
  snoozeAlert: (runId, extraMs) =>
    ipcRenderer.invoke(IPC.snoozeAlert, runId, extraMs),
  savePreset: (preset) => ipcRenderer.invoke(IPC.savePreset, preset),
  deletePreset: (id) => ipcRenderer.invoke(IPC.deletePreset, id),
  getLaunchAtLogin: () => ipcRenderer.invoke(IPC.getLaunchAtLogin),
  setLaunchAtLogin: (enabled) =>
    ipcRenderer.invoke(IPC.setLaunchAtLogin, enabled),
  getSportsSettings: () => ipcRenderer.invoke(IPC.getSportsSettings),
  saveSportsSettings: (settings) =>
    ipcRenderer.invoke(IPC.saveSportsSettings, settings),
  startSports: () => ipcRenderer.invoke(IPC.startSports),
  stopSports: () => ipcRenderer.invoke(IPC.stopSports),
  snoozeSports: (extraMs) => ipcRenderer.invoke(IPC.snoozeSports, extraMs),
  confirmSports: (quantities) =>
    ipcRenderer.invoke(IPC.confirmSports, quantities),
  stopSportsFromAlert: () => ipcRenderer.invoke(IPC.stopSportsFromAlert),
  logSports: (quantities) => ipcRenderer.invoke(IPC.logSports, quantities),
  getSportsStats: () => ipcRenderer.invoke(IPC.getSportsStats),
  setRemainingSports: (targetMs) =>
    ipcRenderer.invoke(IPC.setRemainingSports, targetMs),
  addTimeSports: (extraMs) => ipcRenderer.invoke(IPC.addTimeSports, extraMs),
  onTimerView: (listener) => on<TimerView>(PUSH.timerView, listener),
  onPresets: (listener) => on<readonly Preset[]>(PUSH.presets, listener),
  onHistoryChanged: (listener) => on(PUSH.historyChanged, listener),
  onSports: (listener) => on<SportsView>(PUSH.sports, listener),
}

contextBridge.exposeInMainWorld('klokki', api)
