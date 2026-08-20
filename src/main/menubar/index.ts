import type { Preset } from '../../shared/preset'
import type { TimerView } from '../../shared/timer'
import { menuKey, menubarModel, type MenubarAction } from './model'
import type { MenubarSurface } from './surface'

/** The slices of the timer and the preset store the menubar reads. */
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
}

/** What the menubar can ask the app to do. Starting is by id, as everywhere. */
export type MenubarActions = {
  readonly stop: () => void
  readonly start: (presetId: string) => void
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
 * menubar without a relaunch.
 */
export const createMenubar = (
  surface: MenubarSurface,
  sources: MenubarSources,
  actions: MenubarActions,
): Menubar => {
  let applied: string | null = null

  const perform = (action: MenubarAction): void => {
    switch (action.kind) {
      case 'stop':
        return actions.stop()
      case 'start':
        return actions.start(action.presetId)
      case 'settings':
        return actions.openSettings()
      case 'quit':
        return actions.quit()
    }
  }

  const render = (view: TimerView): void => {
    const model = menubarModel(view, sources.presets.list())
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
  render(sources.timer.getView())

  return {
    menuLabels: surface.menuLabels,
    clickMenuItem: surface.clickMenuItem,
    title: surface.title,
    dispose: () => {
      unsubscribeTimer()
      unsubscribePresets()
    },
  }
}
