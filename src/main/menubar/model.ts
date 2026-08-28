import { skipLabel, startLabel } from '../../shared/labels'
import type { Preset } from '../../shared/preset'
import type { SportsView } from '../../shared/sport'
import type { RunView, TimerView } from '../../shared/timer'

/**
 * What clicking a menu item means, as data rather than as a closure.
 *
 * Data because the model is then comparable — which is how `menuKey` can tell a
 * countdown tick from a real change — and because it keeps the decision of *what*
 * the menubar offers separate from *how* the effect is performed. The adapter is
 * the only thing that knows an action ends in a call to Electron.
 */
export type MenubarAction =
  // Every run-scoped action names its run, because several presets can be
  // running and a menu item that meant "the timer" would be ambiguous the
  // moment a second one started.
  | { readonly kind: 'stop'; readonly runId: string }
  | { readonly kind: 'skip'; readonly runId: string }
  | { readonly kind: 'confirm'; readonly runId: string }
  | { readonly kind: 'addTime'; readonly runId: string }
  | { readonly kind: 'start'; readonly presetId: string }
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
  /** The menubar text. Empty with nothing running: a resident icon, no number. */
  readonly title: string
  readonly tooltip: string
  readonly items: readonly MenubarItem[]
}

/**
 * How the runs are joined in the menubar title, and in the menu items that name
 * a run beside what a click does to it.
 *
 * A middle dot with spaces, which is what macOS itself uses to join unrelated
 * facts in a status item: a comma reads as one list of phases, and a slash or a
 * pipe reads as a choice between them.
 */
export const RUN_SEPARATOR = ' · '

/**
 * One run in the menubar text: what the user is meant to be doing, then how long
 * is left.
 *
 * The phase comes first because it is the part read at a glance, and it is
 * dropped rather than shown as "null" if a running view somehow has no phase —
 * a number with no word beside it is still useful.
 */
const runTitle = (run: RunView): string => {
  if (run.phaseLabel === null) return run.countdown
  // A waiting run has a phase and a length but no clock, and showing its
  // countdown would be a number that never changes — which reads as a stuck
  // timer. It says what it is waiting for instead.
  if (run.awaiting) return `${run.phaseLabel} ready`
  return `${run.phaseLabel} ${run.countdown}`
}

/**
 * The menubar text: every run, in the order they were started.
 *
 * Every one of them, rather than a headline with the rest hidden: a timer the
 * user started and cannot see is a timer they have stopped trusting, and the
 * menubar is the whole UI. Nothing is dropped and nothing is elided here — a
 * long enough title is elided by macOS itself, from the right, and the menu
 * below carries a section per run, so a run pushed off the end of the title is
 * still named, still answerable, and never only in the title.
 */
const trayTitle = (runs: readonly RunView[]): string =>
  runs.length === 0 ? '' : ` ${runs.map(runTitle).join(RUN_SEPARATOR)}`

/**
 * What the menu offers about one run: a heading naming it, then the three things
 * that can be done to it.
 *
 * A waiting run is offered the phase it is holding — the boundary is answerable
 * from the menubar, so an overlay dismissed onto another Space, superseded by a
 * second run's, or missed entirely, is not the only way to start the next phase.
 * Skip is not offered beside it because there is nothing running to cut short:
 * starting the phase it names *is* the skip.
 *
 * Every command carries the preset's name, the way Sports' own Stop carries
 * "Sports". Two runs both offering a bare "Stop" would be two identical items
 * in one menu, and which of them a click landed on would be a matter of reading
 * the heading above it.
 */
const runItems = (run: RunView): readonly MenubarItem[] => {
  const named = (label: string): string =>
    `${label}${RUN_SEPARATOR}${run.presetName}`

  return [
    {
      kind: 'label',
      label: run.awaiting
        ? `${run.presetName} — ${run.phaseLabel} ready`
        : `${run.presetName} — ${run.phaseLabel}`,
    },
    run.awaiting
      ? {
          kind: 'command',
          label: named(`Start ${run.phaseLabel}`),
          action: { kind: 'confirm', runId: run.runId },
        }
      : {
          kind: 'command',
          label: named(skipLabel(run.nextPhaseLabel)),
          action: { kind: 'skip', runId: run.runId },
        },
    {
      kind: 'command',
      label: named('+5 min'),
      action: { kind: 'addTime', runId: run.runId },
    },
    {
      kind: 'command',
      label: named('Stop'),
      action: { kind: 'stop', runId: run.runId },
    },
    { kind: 'separator' },
  ]
}

/**
 * Starting or stopping Sports from the tray, the same way a preset is started
 * from it.
 *
 * There is only ever one Sports schedule, so there is one Start/Restart
 * command rather than a list, and the heading only appears once Sports
 * actually has an activity to ask about — a settings window opened but never
 * filled in shows nothing here. "Restart" is offered for a schedule already
 * running, because a start pushes its next firing a full interval out, which
 * is a real thing to want.
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
  sports: SportsView = NO_SPORTS,
): MenubarModel => ({
  title: trayTitle(view.runs),
  tooltip:
    view.runs.length === 0
      ? 'Klokki'
      : `Klokki — ${view.runs.map((run) => run.phaseLabel ?? run.countdown).join(RUN_SEPARATOR)}`,
  items: [
    ...view.runs.flatMap(runItems),
    // Start or Restart per preset, not per timer: with concurrent runs, the one
    // preset already going is the only one a click would restart — the rest
    // would each add a run of their own.
    ...presets.map((preset): MenubarItem => ({
      kind: 'command',
      label: startLabel(
        preset.name,
        view.runs.some((run) => run.runId === preset.id),
      ),
      action: { kind: 'start', presetId: preset.id },
    })),
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
