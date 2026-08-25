import type { Preset } from '../../shared/preset'
import type { ReminderView } from '../../shared/reminder'
import type { SportsView } from '../../shared/sport'
import type { TimerView } from '../../shared/timer'
import { menuKey, menubarModel, type MenubarAction } from './model'
import type { MenubarSurface } from './surface'

/** The slices of the timer, the preset store and the reminder list the menubar reads. */
export type MenubarSources = {
  readonly timer: {
    readonly getView: () => TimerView
    readonly subscribe: (
      listener: (update: { readonly view: TimerView }) => void,
    ) => () => void
  }
  readonly presets: {
    readonly list: () => readonly Preset[]
    readonly subscribe: (listener: () => void) => () => void
  }
  /**
   * The same joined list the settings window is pushed, so the menu says
   * "Restart" for exactly the reminders that window shows as scheduled.
   */
  readonly reminders: {
    readonly views: () => readonly ReminderView[]
    readonly subscribe: (listener: () => void) => () => void
  }
  /** The same joined view the Sports tab is pushed, so the menu says "Restart" consistently. */
  readonly sports: {
    readonly view: () => SportsView
    readonly subscribe: (listener: () => void) => () => void
  }
}

/** What the menubar can ask the app to do. Starting is by id, as everywhere. */
export type MenubarActions = {
  readonly stop: () => void
  readonly skip: () => void
  /** Starts the phase a waiting run is holding — the tray's answer to a boundary. */
  readonly confirm: () => void
  readonly addTime: () => void
  readonly start: (presetId: string) => void
  readonly startReminder: (reminderId: string) => void
  readonly stopReminder: (reminderId: string) => void
  readonly startSports: () => void
  readonly stopSports: () => void
  /** Fires Sports right now — the tray's "Log Sports Now". */
  readonly fireSportsNow: () => void
  readonly openSettings: () => void
  readonly quit: () => void
}

export type Menubar = {
  /** The menu as the user would read it — the e2e suite's only view of it. */
  readonly menuLabels: () => readonly string[]
  readonly clickMenuItem: (label: string) => boolean
  readonly title: () => string
  readonly dispose: () => void
}

/**
 * Keeps the menubar showing the current state of the app.
 *
 * The title is applied on every update, because it carries the countdown. The
 * menu is applied only when `menuKey` says it changed: rebuilding it every second
 * would be wasted work and would close it under the user's cursor. A preset saved
 * in the settings window changes that key, which is how an edit reaches the
 * menubar without a relaunch. A reminder firing changes it too: its next firing
 * is what decides whether the menu says Start or Restart.
 */
export const createMenubar = (
  surface: MenubarSurface,
  sources: MenubarSources,
  actions: MenubarActions,
): Menubar => {
  let applied: string | null = null

  /** The run and preset actions — split out so `perform` stays under the complexity limit. */
  const performTimer = (action: MenubarAction): boolean => {
    switch (action.kind) {
      case 'stop':
        actions.stop()
        return true
      case 'skip':
        actions.skip()
        return true
      case 'confirm':
        actions.confirm()
        return true
      case 'addTime':
        actions.addTime()
        return true
      case 'start':
        actions.start(action.presetId)
        return true
      default:
        return false
    }
  }

  /** The reminder and Sports actions — the other half of `perform`. */
  const performSchedules = (action: MenubarAction): boolean => {
    switch (action.kind) {
      case 'startReminder':
        actions.startReminder(action.reminderId)
        return true
      case 'stopReminder':
        actions.stopReminder(action.reminderId)
        return true
      case 'startSports':
        actions.startSports()
        return true
      case 'stopSports':
        actions.stopSports()
        return true
      case 'fireSportsNow':
        actions.fireSportsNow()
        return true
      default:
        return false
    }
  }

  const perform = (action: MenubarAction): void => {
    if (performTimer(action) || performSchedules(action)) return
    switch (action.kind) {
      case 'settings':
        return actions.openSettings()
      case 'quit':
        return actions.quit()
    }
  }

  const render = (view: TimerView): void => {
    const model = menubarModel(
      view,
      sources.presets.list(),
      sources.reminders.views(),
      sources.sports.view(),
    )
    surface.setTitle(model.title)
    surface.setToolTip(model.tooltip)

    const key = menuKey(model)
    if (key === applied) return
    applied = key
    surface.setMenu(model.items, perform)
  }

  const unsubscribeTimer = sources.timer.subscribe(({ view }) => render(view))
  const unsubscribePresets = sources.presets.subscribe(() =>
    render(sources.timer.getView()),
  )
  // A reminder created, enabled or fired changes what this menu offers, for the
  // same reason a saved preset does — so it is a subscription, not a read.
  const unsubscribeReminders = sources.reminders.subscribe(() =>
    render(sources.timer.getView()),
  )
  // A Sports firing or edit changes what this menu offers, for the same
  // reason a reminder does.
  const unsubscribeSports = sources.sports.subscribe(() =>
    render(sources.timer.getView()),
  )
  render(sources.timer.getView())

  return {
    menuLabels: surface.menuLabels,
    clickMenuItem: surface.clickMenuItem,
    title: surface.title,
    dispose: () => {
      unsubscribeTimer()
      unsubscribePresets()
      unsubscribeReminders()
      unsubscribeSports()
    },
  }
}
