import type { AppInfo } from '../shared/ipc'
import { ADD_TIME_MS } from '../shared/timer'
import { createAlertPresenter, type AlertSurface } from './alert/present'
import { wireAlerts } from './alert/wire'
import type { History, ReminderHistory, SportsHistory } from './history'
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
import { startReminderById, stopReminderById } from './reminders/start'
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
import { startSports, stopSports } from './sports/start'
import type { SportRunState } from './sports/engine'
import {
  createSportsAlertPresenter,
  type SportsAlertSurface,
} from './sports/present'
import type { SportRunStore } from './sports/run-store'
import type { SportsService } from './sports/service'
import type { SportStore } from './sports/store'
import { createSportsViewSource } from './sports/view-source'
import { wireSportsAlerts } from './sports/wire'
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
  readonly sportsHistory: SportsHistory
  readonly sportsStore: SportStore
  readonly sportsService: SportsService
  readonly sportsRunStore: SportRunStore & {
    readonly load: () => SportRunState
  }
  readonly loginItem: LoginItem
  readonly requests: RequestSink
  readonly appInfo: () => AppInfo
  readonly menubar: MenubarSurface
  readonly alerts: AlertSurface
  readonly overlay: OverlayControl
  readonly reminderAlerts: ReminderAlertSurface
  readonly reminderOverlay: OverlayControl
  readonly sportsAlerts: SportsAlertSurface
  readonly sportsOverlay: OverlayControl
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
  // Every change to the schedule is worth saving, not only a firing: an
  // answered reminder's next interval starts at the answer, and a restart from
  // the tray moves it too.
  const unwireReminderTick = ports.reminderService.onScheduleChange(() => {
    persistReminderRun()
  })

  // Built after the listeners above, so its own store/service subscriptions
  // fire after `setDefinitions` has already updated the schedule for this
  // change — a save picked up by the view join in the same tick it lands.
  const reminderViewSource = createReminderViewSource(
    ports.reminderStore,
    ports.reminderService,
  )

  const sportsAlerts = wireSportsAlerts(
    ports.sportsService,
    ports.sportsStore,
    createSportsAlertPresenter(ports.sportsAlerts),
    ports.sportsOverlay.close,
    ports.sportsHistory.append,
    ports.clock ?? systemClock,
  )

  const persistSportsRun = (): void =>
    ports.sportsRunStore.save(ports.sportsService.getState())

  // Restores what was scheduled before the restart, then reconciles against
  // the store — same reasoning as the reminder resume above.
  ports.sportsService.resume(
    ports.sportsRunStore.load(),
    ports.sportsStore.get(),
  )
  ports.sportsService.setSettings(ports.sportsStore.get())
  persistSportsRun()

  const unwireSportsStore = ports.sportsStore.subscribe((settings) => {
    ports.sportsService.setSettings(settings)
    persistSportsRun()
  })
  const unwireSportsTick = ports.sportsService.onScheduleChange(() => {
    persistSportsRun()
  })

  const sportsViewSource = createSportsViewSource(
    ports.sportsStore,
    ports.sportsService,
  )

  const broadcaster = createViewBroadcaster({
    timer: ports.service,
    presets: ports.store,
    history: ports.history,
    reminderHistory: ports.reminderHistory,
    reminders: reminderViewSource,
    sportsHistory: ports.sportsHistory,
    sports: sportsViewSource,
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
    sportsHistory: ports.sportsHistory,
    sportsStore: ports.sportsStore,
    sportsViews: sportsViewSource.view,
    sportsAnswers: sportsAlerts,
    startSports: () => startSports(ports.sportsStore, ports.sportsService),
    stopSports: () => stopSports(ports.sportsStore),
    // Only the activities the tab's form actually had a number for — unlike
    // the overlay's confirm, a manual log is not a full round, so an activity
    // left blank is not "zero of it", it is "not logged this time".
    logSports: (quantities) => {
      const loggedAt = (ports.clock ?? systemClock).now()
      for (const activity of ports.sportsStore.get().activities) {
        const quantity = quantities[activity.id]
        if (quantity === undefined) continue
        ports.sportsHistory.append({
          loggedAt,
          activityId: activity.id,
          activityLabel: activity.name,
          quantity,
        })
      }
    },
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
    {
      timer: ports.service,
      presets: ports.store,
      reminders: reminderViewSource,
      sports: sportsViewSource,
    },
    {
      stop: () => ports.service.stop(),
      skip: () => {
        ports.service.skip()
      },
      confirm: () => {
        ports.service.confirm()
      },
      addTime: () => {
        ports.service.addTime(ADD_TIME_MS)
      },
      start: (id) => startPresetById(ports.service, ports.store, id),
      startReminder: (id) =>
        startReminderById(ports.reminderStore, ports.reminderService, id),
      stopReminder: (id) => stopReminderById(ports.reminderStore, id),
      startSports: () => startSports(ports.sportsStore, ports.sportsService),
      stopSports: () => stopSports(ports.sportsStore),
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
      unwireSportsStore()
      unwireSportsTick()
      sportsViewSource.dispose()
      sportsAlerts.dispose()
      menubar.dispose()
      broadcaster.dispose()
      ports.service.dispose()
      ports.reminderService.dispose()
      ports.sportsService.dispose()
    },
  }
}
