import type { AppInfo } from '../shared/ipc'
import { createAlertPresenter, type AlertSurface } from './alert/present'
import { wireAlerts } from './alert/wire'
import type { History } from './history'
import { recordHistory } from './history/record'
import {
  createViewBroadcaster,
  type ViewBroadcaster,
  type ViewTarget,
} from './ipc/broadcast'
import { registerIpc, type OverlayControl, type RequestSink } from './ipc'
import type { LoginItem } from './login-item'
import { createMenubar, type Menubar } from './menubar'
import type { MenubarSurface } from './menubar/surface'
import { startPresetById } from './presets/start'
import type { PresetStore } from './presets/store'
import type { TimerState } from './timer/machine'
import { persistSnapshot } from './timer/persist'
import type { TimerService } from './timer/service'
import type { SnapshotStore } from './timer/snapshot'

/** A window, as much of one as the broadcaster needs to keep it fed. */
export type WindowHandle = {
  readonly target: ViewTarget
  readonly onClosed: (listener: () => void) => void
}

/**
 * Everything the app is wired out of. The platform-shaped ports — the menubar,
 * the notification and overlay, the request sink, the windows — are the four
 * places Electron gets in, and each has an in-memory adapter in wire.test.ts.
 */
export type AppPorts = {
  readonly service: TimerService
  readonly store: PresetStore
  readonly history: History
  readonly snapshot: SnapshotStore & {
    readonly load: () => TimerState | null
  }
  readonly loginItem: LoginItem
  readonly requests: RequestSink
  readonly appInfo: () => AppInfo
  readonly menubar: MenubarSurface
  readonly alerts: AlertSurface
  readonly overlay: OverlayControl
  readonly windows: {
    readonly onOpened: (listener: (window: WindowHandle) => void) => void
  }
  readonly openSettings: () => void
  readonly quit: () => void
}

export type WiredApp = {
  readonly menubar: Menubar
  readonly broadcaster: ViewBroadcaster
  readonly dispose: () => void
}

/**
 * Everything that has to be connected for Klokki to be Klokki, in one function
 * that never mentions Electron.
 *
 * The bootstrap in index.ts builds the adapters and calls this; the test builds
 * fakes and calls this. Which is the point: a phase boundary reaching a
 * notification, the log, and every open window is a property of how these are
 * joined up, and nothing above this line could assert it.
 */
export const wireApp = (ports: AppPorts): WiredApp => {
  const broadcaster = createViewBroadcaster({
    timer: ports.service,
    presets: ports.store,
    history: ports.history,
  })

  // Every window is a subscriber for as long as it exists, and stops being one
  // the moment it closes. Registering here rather than where windows are opened
  // means a window added later cannot forget to do it.
  ports.windows.onOpened((window) => {
    broadcaster.register(window.target)
    window.onClosed(() => broadcaster.unregister(window.target))
  })

  registerIpc({
    requests: ports.requests,
    service: ports.service,
    store: ports.store,
    loginItem: ports.loginItem,
    history: ports.history,
    overlay: ports.overlay,
    appInfo: ports.appInfo,
  })

  const unwireAlerts = wireAlerts(
    ports.service,
    createAlertPresenter(ports.alerts),
  )
  const unwireHistory = recordHistory(ports.service, ports.history.append)
  const unwireSnapshot = persistSnapshot(ports.service, ports.snapshot)

  // Loaded after the listeners above are wired, so a run that finished or
  // advanced while the app was closed still reaches history and the alert
  // surface — the same as a boundary the poll drains after waking from sleep.
  const saved = ports.snapshot.load()
  if (saved) ports.service.resume(saved)

  const menubar = createMenubar(
    ports.menubar,
    { timer: ports.service, presets: ports.store },
    {
      stop: () => ports.service.stop(),
      skip: () => {
        ports.service.skip()
      },
      start: (id) => startPresetById(ports.service, ports.store, id),
      openSettings: ports.openSettings,
      quit: ports.quit,
    },
  )

  return {
    menubar,
    broadcaster,
    dispose: () => {
      unwireAlerts()
      unwireHistory()
      unwireSnapshot()
      menubar.dispose()
      broadcaster.dispose()
      ports.service.dispose()
    },
  }
}
