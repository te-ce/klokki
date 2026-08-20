import { startLabel } from '../../shared/labels'
import type { Preset } from '../../shared/preset'
import type { TimerView } from '../../shared/timer'

/**
 * What clicking a menu item means, as data rather than as a closure.
 *
 * Data because the model is then comparable — which is how `menuKey` can tell a
 * countdown tick from a real change — and because it keeps the decision of *what*
 * the menubar offers separate from *how* the effect is performed. The adapter is
 * the only thing that knows an action ends in a call to Electron.
 */
export type MenubarAction =
  | { readonly kind: 'stop' }
  | { readonly kind: 'start'; readonly presetId: string }
  | { readonly kind: 'settings' }
  | { readonly kind: 'quit' }

export type MenubarItem =
  | { readonly kind: 'separator' }
  /** The running phase: read, not clicked. */
  | { readonly kind: 'label'; readonly label: string }
  | {
      readonly kind: 'command'
      readonly label: string
      readonly action: MenubarAction
    }

export type MenubarModel = {
  /** The menubar text. Empty while idle: a resident icon with no number. */
  readonly title: string
  readonly tooltip: string
  readonly items: readonly MenubarItem[]
}

/**
 * Everything the menubar shows, for one moment of one preset list.
 *
 * The menubar is the whole UI: the title carries the countdown as text, because
 * a filling arc is illegible at 22px and a number is not. Starting is by preset
 * id, not by preset object, so the menu and the settings window take the same
 * path into the timer — and so an item clicked after the preset was edited runs
 * the saved version.
 */
export const menubarModel = (
  view: TimerView,
  presets: readonly Preset[],
): MenubarModel => ({
  title: view.running ? ` ${view.countdown}` : '',
  tooltip: view.running ? `Klokki — ${view.phaseLabel}` : 'Klokki',
  items: [
    ...(view.running
      ? ([
          { kind: 'label', label: `${view.presetName} — ${view.phaseLabel}` },
          { kind: 'command', label: 'Stop', action: { kind: 'stop' } },
          { kind: 'separator' },
        ] as const)
      : []),
    ...presets.map((preset): MenubarItem => ({
      kind: 'command',
      label: startLabel(preset.name, view.running),
      action: { kind: 'start', presetId: preset.id },
    })),
    { kind: 'separator' },
    { kind: 'command', label: 'Settings…', action: { kind: 'settings' } },
    { kind: 'command', label: 'Quit Klokki', action: { kind: 'quit' } },
  ],
})

/**
 * Identity of the menu itself, ignoring the title.
 *
 * The countdown changes every second and the menu does not, so rebuilding on
 * every update would be wasted work and would close the menu under the user's
 * cursor. Comparing the items rather than a hand-written list of the fields that
 * matter means a new kind of item cannot forget to invalidate this.
 */
export const menuKey = (model: MenubarModel): string =>
  JSON.stringify(model.items)
