import type { AppInfo } from '../shared/ipc'
import { ADD_TIME_MS } from '../shared/timer'
import { createAlertPresenter, type AlertSurface } from './alert/present'
import { wireAlerts } from './alert/wire'
import type { History, ReminderHistory } from './history'
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
import type { RemindersState } from './reminders/engine'
import {
  createReminderAlertPresenter,
  type ReminderAlertSurface,
} from './reminders/present'
import type { ReminderRunStore } from './reminders/run-store'
import type { ReminderService } from './reminders/service'
import type { ReminderStore } from './reminders/store'
import { createReminderViewSource } from './reminders/view-source'
import { wireReminderAlerts } from './reminders/wire'
import { systemClock, type Clock } from './timer/clock'
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
  readonly reminderHistory: ReminderHistory
  readonly snapshot: SnapshotStore & {
    readonly load: () => TimerState | null
  }
  readonly reminderStore: ReminderStore
  readonly reminderService: ReminderService
  readonly reminderRunStore: ReminderRunStore & {
    readonly load: () => RemindersState
  }
  readonly loginItem: LoginItem
  readonly requests: RequestSink
  readonly appInfo: () => AppInfo
  readonly menubar: MenubarSurface
  readonly alerts: AlertSurface
  readonly overlay: OverlayControl
  readonly reminderAlerts: ReminderAlertSurface
  readonly reminderOverlay: OverlayControl
  readonly windows: {
    readonly onOpened: (listener: (window: WindowHandle) => void) => void
  }
  readonly openSettings: () => void
  readonly quit: () => void
  /** For the loggedAt stamp on a reminder answer. Defaults to the system clock. */
  readonly clock?: Clock
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
  const reminderAlerts = wireReminderAlerts(
    ports.reminderService,
    createReminderAlertPresenter(ports.reminderAlerts),
    ports.reminderOverlay.close,
    ports.reminderHistory.append,
    ports.clock ?? systemClock,
  )

  const persistReminderRun = (): void =>
    ports.reminderRunStore.save(ports.reminderService.getState())

  // Restores what was scheduled before the restart, then reconciles against
  // the store: a reminder created or enabled since the last save has no saved
  // run yet and is scheduled fresh, one disabled or deleted since is dropped.
  ports.reminderService.resume(
    ports.reminderRunStore.load(),
    ports.reminderStore.list(),
  )
  ports.reminderService.setDefinitions(ports.reminderStore.list())
  persistReminderRun()

  const unwireReminderStore = ports.reminderStore.subscribe((list) => {
    ports.reminderService.setDefinitions(list)
    persistReminderRun()
  })
  const unwireReminderTick = ports.reminderService.subscribe(() => {
    persistReminderRun()
  })

  // Built after the listeners above, so its own store/service subscriptions
  // fire after `setDefinitions` has already updated the schedule for this
  // change — a save picked up by the view join in the same tick it lands.
  const reminderViewSource = createReminderViewSource(
    ports.reminderStore,
    ports.reminderService,
  )

  const broadcaster = createViewBroadcaster({
    timer: ports.service,
    presets: ports.store,
    history: ports.history,
    reminderHistory: ports.reminderHistory,
    reminders: reminderViewSource,
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
    reminderHistory: ports.reminderHistory,
    overlay: ports.overlay,
    reminderStore: ports.reminderStore,
    reminderViews: reminderViewSource.views,
    reminderAnswers: reminderAlerts,
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
      addTime: () => {
        ports.service.addTime(ADD_TIME_MS)
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
      unwireReminderStore()
      unwireReminderTick()
      reminderViewSource.dispose()
      reminderAlerts.dispose()
      menubar.dispose()
      broadcaster.dispose()
      ports.service.dispose()
      ports.reminderService.dispose()
    },
  }
}
