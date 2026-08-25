import { skipLabel, startLabel } from '../../shared/labels'
import type { Preset } from '../../shared/preset'
import type { ReminderView } from '../../shared/reminder'
import type { SportsView } from '../../shared/sport'
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
  | { readonly kind: 'skip' }
  | { readonly kind: 'confirm' }
  | { readonly kind: 'addTime' }
  | { readonly kind: 'start'; readonly presetId: string }
  | { readonly kind: 'startReminder'; readonly reminderId: string }
  | { readonly kind: 'stopReminder'; readonly reminderId: string }
  | { readonly kind: 'startSports' }
  | { readonly kind: 'stopSports' }
  | { readonly kind: 'fireSportsNow' }
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
 * The menubar text: what the user is meant to be doing, then how long is left.
 *
 * The phase comes first because it is the part read at a glance, and it is
 * dropped rather than shown as "null" if a running view somehow has no phase —
 * a number with no word beside it is still useful.
 */
const trayTitle = (view: TimerView): string => {
  if (view.phaseLabel === null) return ` ${view.countdown}`
  // A waiting run has a phase and a length but no clock, and showing its
  // countdown would be a number that never changes — which reads as a stuck
  // timer. It says what it is waiting for instead.
  if (view.awaiting) return ` ${view.phaseLabel} ready`
  return ` ${view.phaseLabel} ${view.countdown}`
}

/**
 * What the menu offers about the run in progress, if there is one.
 *
 * A waiting run is offered the phase it is holding — the boundary is answerable
 * from the menubar, so an overlay dismissed onto another Space, or missed
 * entirely, is not the only way to start the next phase. Skip is not offered
 * beside it because there is nothing running to cut short: starting the phase it
 * names *is* the skip.
 */
const runItems = (view: TimerView): readonly MenubarItem[] => {
  if (!view.running) return []

  return [
    {
      kind: 'label',
      label: view.awaiting
        ? `${view.presetName} — ${view.phaseLabel} ready`
        : `${view.presetName} — ${view.phaseLabel}`,
    },
    view.awaiting
      ? {
          kind: 'command',
          label: `Start ${view.phaseLabel}`,
          action: { kind: 'confirm' },
        }
      : {
          kind: 'command',
          label: skipLabel(view.nextPhaseLabel),
          action: { kind: 'skip' },
        },
    { kind: 'command', label: '+5 min', action: { kind: 'addTime' } },
    { kind: 'command', label: 'Stop', action: { kind: 'stop' } },
    { kind: 'separator' },
  ]
}

/**
 * Starting a reminder from the tray, the same way a preset is started from it.
 *
 * A reminder has no countdown to put in the title, but starting one is the same
 * decision as starting a preset — "begin nudging me about this now" — and
 * requiring the settings window for it made the one thing the menubar is for
 * (acting without opening a window) unavailable to half the app. "Restart" is
 * offered for a reminder already scheduled, because a start pushes its next
 * firing a full interval out, which is a real thing to want.
 *
 * "Stop" sits beside it for a reminder that is on — turning one off is the
 * other half of the same promise, and it should not need the settings window
 * either. It is offered on `enabled` rather than `nextFireAt`, because a
 * reminder waiting on an unanswered step has no `nextFireAt` but is very much
 * on, and disabling it is exactly what stops that wait — unlike Start/Restart,
 * which name what a click does to the schedule and so still read by it.
 *
 * The heading is there because "Start Water" reads as a preset otherwise, and a
 * menu of two lists with nothing between them names neither.
 */
const reminderItems = (
  reminders: readonly ReminderView[],
): readonly MenubarItem[] => {
  if (reminders.length === 0) return []

  return [
    { kind: 'separator' },
    { kind: 'label', label: 'Reminders' },
    ...reminders.flatMap((reminder): readonly MenubarItem[] => [
      {
        kind: 'command',
        label: startLabel(reminder.name, reminder.nextFireAt !== null),
        action: { kind: 'startReminder', reminderId: reminder.id },
      },
      ...(reminder.enabled
        ? [
            {
              kind: 'command',
              label: `Stop ${reminder.name}`,
              action: { kind: 'stopReminder', reminderId: reminder.id },
            } as const,
          ]
        : []),
    ]),
  ]
}

/**
 * Starting or stopping Sports from the tray — the single-schedule
 * counterpart to `reminderItems`. There is only ever one Sports schedule, so
 * there is one Start/Restart command rather than a list, and the heading
 * only appears once Sports actually has an activity to ask about — a
 * settings window opened but never filled in shows nothing here.
 */
const sportsItems = (sports: SportsView): readonly MenubarItem[] => {
  if (sports.activities.length === 0) return []

  return [
    { kind: 'separator' },
    { kind: 'label', label: 'Sports' },
    {
      kind: 'command',
      label: startLabel('Sports', sports.nextFireAt !== null),
      action: { kind: 'startSports' },
    },
    // Hidden while a firing is already awaiting an answer: the overlay it
    // would raise is already on screen, and firing again would not open a
    // second one, only replace the one the user is looking at.
    ...(sports.awaiting
      ? []
      : [
          {
            kind: 'command',
            label: 'Log Sports Now',
            action: { kind: 'fireSportsNow' },
          } as const,
        ]),
    ...(sports.enabled
      ? [
          {
            kind: 'command',
            label: 'Stop Sports',
            action: { kind: 'stopSports' },
          } as const,
        ]
      : []),
  ]
}

/**
 * Everything the menubar shows, for one moment of one preset list.
 *
 * The menubar is the whole UI: the title carries the phase and the countdown as
 * text, because a filling arc is illegible at 22px and a number is not, and
 * "29:14" alone does not say whether the user should be sitting or standing —
 * which is the one thing a glance at the menubar is for. Starting is by preset
 * id, not by preset object, so the menu and the settings window take the same
 * path into the timer — and so an item clicked after the preset was edited runs
 * the saved version.
 */
/** No Sports schedule at all — the default for a caller that has nothing to say about it. */
const NO_SPORTS: SportsView = {
  intervalMinutes: 0,
  activities: [],
  enabled: false,
  nextFireAt: null,
  awaiting: false,
  remainingMs: null,
  countdown: null,
}

export const menubarModel = (
  view: TimerView,
  presets: readonly Preset[],
  reminders: readonly ReminderView[],
  sports: SportsView = NO_SPORTS,
): MenubarModel => ({
  title: view.running ? trayTitle(view) : '',
  tooltip: view.running ? `Klokki — ${view.phaseLabel}` : 'Klokki',
  items: [
    ...runItems(view),
    ...presets.map((preset): MenubarItem => ({
      kind: 'command',
      label: startLabel(preset.name, view.running),
      action: { kind: 'start', presetId: preset.id },
    })),
    ...reminderItems(reminders),
    ...sportsItems(sports),
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
