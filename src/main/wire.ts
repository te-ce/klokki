import type { AppInfo } from '../shared/ipc'
import { ADD_TIME_MS } from '../shared/timer'
import { createAlertPresenter, type AlertSurface } from './alert/present'
import { voidAlert } from './alert/void'
import { wireAlerts } from './alert/wire'
import type { History, SportsHistory } from './history'
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
import {
  fireSportsNow,
  logSports,
  startSports,
  stopSports,
} from './sports/start'
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
  readonly snapshot: SnapshotStore & {
    readonly load: () => readonly TimerState[]
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
  readonly sportsAlerts: SportsAlertSurface
  readonly sportsOverlay: OverlayControl
  readonly windows: {
    readonly onOpened: (listener: (window: WindowHandle) => void) => void
  }
  readonly openSettings: () => void
  readonly quit: () => void
  /** For the loggedAt stamp on a Sports answer. Defaults to the system clock. */
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
  // One per kind: an alert is void when the thing that raised it stops, and
  // voiding it is closing the overlay *and* withdrawing the notification —
  // both halves, because it was one alert (see alert/void.ts). Each kind voids
  // only its own, which is what keeps a stopped Sports firing from clearing
  // the transition overlay.
  const voidTimerAlert = voidAlert(ports.alerts, ports.overlay)
  const voidSportsAlert = voidAlert(ports.sportsAlerts, ports.sportsOverlay)

  const sportsAlerts = wireSportsAlerts(
    {
      subscribe: ports.sportsService.subscribe,
      snooze: ports.sportsService.snooze,
      confirm: ports.sportsService.confirm,
      stop: () => stopSports(ports.sportsStore),
    },
    ports.sportsStore,
    createSportsAlertPresenter(ports.sportsAlerts, () => sportsAlerts.stop()),
    voidSportsAlert,
    ports.sportsHistory.append,
    ports.clock ?? systemClock,
  )

  const persistSportsRun = (): void =>
    ports.sportsRunStore.save(ports.sportsService.getState())

  // Restores what was scheduled before the restart, then reconciles against
  // the store: Sports enabled since the last save has no saved run yet and is
  // scheduled fresh, disabled since is dropped.
  ports.sportsService.resume(
    ports.sportsRunStore.load(),
    ports.sportsStore.get(),
  )
  ports.sportsService.setSettings(ports.sportsStore.get())
  persistSportsRun()

  const unwireSportsStore = ports.sportsStore.subscribe((settings) => {
    ports.sportsService.setSettings(settings)
    persistSportsRun()
    // The store is where every stop of Sports ends up — the tray, the settings
    // window's toggle — so it is also the honest place to notice that an alert
    // has outlived it: every Sports stop is a save with `enabled: false`,
    // wherever the user made it.
    sportsAlerts.voidStopped(settings.enabled)
  })
  const unwireSportsTick = ports.sportsService.onScheduleChange(() => {
    persistSportsRun()
  })

  const sportsViewSource = createSportsViewSource(
    ports.sportsStore,
    ports.sportsService,
    ports.clock ?? systemClock,
  )

  const broadcaster = createViewBroadcaster({
    timer: ports.service,
    presets: ports.store,
    history: ports.history,
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

  // Turns the timer's boundaries into overlays, and owns which run's alert is on
  // screen — because two runs can each reach a boundary and the overlay window
  // is one (see alert/queue.ts). Built before the stop closure below, which
  // needs it, and subscribed here rather than at the bottom so a resumed run's
  // drained boundary still reaches it.
  const timerAlerts = wireAlerts(
    ports.service,
    // The notification's Stop button stops the run named by the alert it is
    // attached to, which is the same run the overlay's Stop stops.
    createAlertPresenter(ports.alerts, (runId) => stopTimer(runId)),
    voidTimerAlert,
  )

  // Stopping one run, from wherever: the tray, the settings window, the
  // overlay's own Stop, the notification's Stop button. The run ends and the
  // alert announcing its boundary goes with it, because a boundary of a stopped
  // run has nothing left to answer — and only that run's, so a second run's
  // overlay is left alone and its own boundary comes forward if it was queued.
  //
  // The timer is the one kind with no store behind its stop, so this closure is
  // what the Sports store subscription above is for the other one — and it has
  // to be a closure rather than a subscription to `service`, because
  // a run reaching its own last phase also leaves the collection, and *that*
  // alert is the one thing the user still wants to see.
  const stopTimer = (runId: string): void => {
    ports.service.stop(runId)
    timerAlerts.answered(runId)
  }

  registerIpc({
    requests: ports.requests,
    service: ports.service,
    store: ports.store,
    loginItem: ports.loginItem,
    history: ports.history,
    answerAlert: timerAlerts.answered,
    sportsHistory: ports.sportsHistory,
    sportsStore: ports.sportsStore,
    sportsViews: sportsViewSource.view,
    sportsAnswers: sportsAlerts,
    sportsService: ports.sportsService,
    startSports: () => startSports(ports.sportsStore, ports.sportsService),
    stopSports: () => stopSports(ports.sportsStore),
    stopTimer,
    // Only the activities the tab's form actually had a number for — unlike
    // the overlay's confirm, a manual log is not a full round, so an activity
    // left blank is not "zero of it", it is "not logged this time" — see
    // `logSports` in sports/start.ts for the restart-only-if-running rule.
    logSports: (quantities) =>
      logSports(
        ports.sportsStore,
        ports.sportsService,
        ports.sportsHistory.append,
        quantities,
        ports.clock ?? systemClock,
      ),
    appInfo: ports.appInfo,
  })

  const unwireHistory = recordHistory(ports.service, ports.history.append)
  const unwireSnapshot = persistSnapshot(ports.service, ports.snapshot)

  // Loaded after the listeners above are wired, so a run that finished or
  // advanced while the app was closed still reaches history and the alert
  // surface — the same as a boundary the poll drains after waking from sleep.
  // Every run comes back, not the last one saved: the snapshot is the whole
  // collection (see timer/persist.ts).
  ports.service.resume(ports.snapshot.load())

  const menubar = createMenubar(
    ports.menubar,
    {
      timer: ports.service,
      presets: ports.store,
      sports: sportsViewSource,
    },
    {
      stop: stopTimer,
      // Skipping and confirming both settle the run's boundary, so its alert is
      // answered with them — the same move the overlay's own affirmative makes,
      // and the reason a boundary answered from the tray does not leave its
      // overlay standing over a phase that has already started.
      skip: (runId) => {
        ports.service.skip(runId)
        timerAlerts.answered(runId)
      },
      confirm: (runId) => {
        ports.service.confirm(runId)
        timerAlerts.answered(runId)
      },
      addTime: (runId) => {
        ports.service.addTime(runId, ADD_TIME_MS)
      },
      start: (id) => startPresetById(ports.service, ports.store, id),
      startSports: () => startSports(ports.sportsStore, ports.sportsService),
      stopSports: () => stopSports(ports.sportsStore),
      fireSportsNow: () => {
        fireSportsNow(ports.sportsService)
      },
      openSettings: ports.openSettings,
      quit: ports.quit,
    },
  )

  return {
    menubar,
    broadcaster,
    dispose: () => {
      timerAlerts.dispose()
      unwireHistory()
      unwireSnapshot()
      unwireSportsStore()
      unwireSportsTick()
      sportsViewSource.dispose()
      sportsAlerts.dispose()
      menubar.dispose()
      broadcaster.dispose()
      ports.service.dispose()
      ports.sportsService.dispose()
    },
  }
}
