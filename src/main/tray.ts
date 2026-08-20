import { Menu, Tray, app, nativeImage } from 'electron'
import { join } from 'node:path'
import type { Preset } from '../shared/preset'
import { SEED_PRESETS } from '../shared/presets'
import type { TimerService, TimerView } from './timer/service'
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
 * The menubar is the whole UI: the title carries the countdown as text, because
 * a filling arc is illegible at 22px and a number is not.
 */
export const createTray = (service: TimerService): Tray => {
  const image = nativeImage.createFromPath(ICON)
  // Template images are tinted by macOS to match the menubar.
  image.setTemplateImage(true)

  const tray = new Tray(image)
  // The menu only changes when the phase does; rebuilding it every second would
  // be wasted work and would close it under the user's cursor.
  let menuKey = ''

  const render = (view: TimerView): void => {
    tray.setTitle(view.running ? ` ${view.countdown}` : '')
    tray.setToolTip(view.running ? `Klokki — ${view.phaseLabel}` : 'Klokki')

    const nextKey = `${view.running}:${view.presetName}:${view.phaseLabel}`
    if (nextKey === menuKey) return
    menuKey = nextKey
    tray.setContextMenu(buildMenu(service, view, SEED_PRESETS))
  }

  service.subscribe(({ view }) => render(view))
  render(service.getView())

  return tray
}
