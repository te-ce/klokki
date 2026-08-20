import { Menu, Tray, app, nativeImage } from 'electron'
import { join } from 'node:path'
import type { Preset } from '../shared/preset'
import type { TimerView } from '../shared/timer'
import type { TimerService } from './timer/service'
import { openSettingsWindow } from './windows'

const ICON = join(import.meta.dirname, '../../resources/trayTemplate.png')

const buildMenu = (
  service: TimerService,
  view: TimerView,
  presets: readonly Preset[],
): Menu =>
  Menu.buildFromTemplate([
    ...(view.running
      ? [
          { label: `${view.presetName} — ${view.phaseLabel}`, enabled: false },
          { label: 'Stop', click: () => service.stop() },
          { type: 'separator' as const },
        ]
      : []),
    ...presets.map((preset) => ({
      label: view.running ? `Restart ${preset.name}` : `Start ${preset.name}`,
      click: () => service.startPreset(preset),
    })),
    { type: 'separator' },
    { label: 'Settings…', click: openSettingsWindow },
    { label: 'Quit Klokki', click: () => app.quit() },
  ])

/**
 * A live handle on the menubar. `clickMenuItem` exists because macOS exposes no
 * way to click the menubar from outside the app, so the e2e suite drives the
 * real menu template through this instead of a screenshot (see AGENTS.md).
 */
export type TrayHandle = {
  readonly tray: Tray
  readonly clickMenuItem: (label: string) => boolean
}

/**
 * The menubar is the whole UI: the title carries the countdown as text, because
 * a filling arc is illegible at 22px and a number is not.
 */
export const createTray = (
  service: TimerService,
  presets: readonly Preset[],
): TrayHandle => {
  const image = nativeImage.createFromPath(ICON)
  // Template images are tinted by macOS to match the menubar.
  image.setTemplateImage(true)

  const tray = new Tray(image)
  // The menu only changes when the phase does; rebuilding it every second would
  // be wasted work and would close it under the user's cursor.
  let menuKey = ''
  let menu: Menu | null = null

  const render = (view: TimerView): void => {
    tray.setTitle(view.running ? ` ${view.countdown}` : '')
    tray.setToolTip(view.running ? `Klokki — ${view.phaseLabel}` : 'Klokki')

    const nextKey = `${view.running}:${view.presetName}:${view.phaseLabel}`
    if (nextKey === menuKey) return
    menuKey = nextKey
    menu = buildMenu(service, view, presets)
    tray.setContextMenu(menu)
  }

  service.subscribe(({ view }) => render(view))
  render(service.getView())

  return {
    tray,
    clickMenuItem: (label) => {
      const item = menu?.items.find((candidate) => candidate.label === label)
      if (!item?.click) return false
      item.click()
      return true
    },
  }
}
