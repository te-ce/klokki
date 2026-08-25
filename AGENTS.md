# Klokki — agent guide

Menubar interval timer for macOS. Presets are ordered phase lists; ships with
Pomodoro (25/5) and sit/stand (30/15), plus user-defined presets.

## The one rule

**State and time live in the main process. The renderer is a view.**

The app is resident in the menubar and its windows are closed almost all of the
time, so the countdown cannot live in React. There is no `setInterval` in the
renderer, and no second copy of timer state there. The renderer reads and writes
through the typed bridge in `src/shared/ipc.ts` and nothing else.

This is enforced by the runtime, not by discipline: every window runs with
`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. A renderer
that cannot reach the filesystem cannot grow its own state.

## Layout

| Path                | Role                                                             |
| ------------------- | ---------------------------------------------------------------- |
| `src/main/`         | Phase machine, presets, history, menubar, windows. All the logic |
| `src/main/wire.ts`  | How all of it is joined up — the whole app, minus Electron       |
| `src/preload/`      | The only bridge: exposes `window.klokki` via `contextBridge`     |
| `src/shared/ipc.ts` | The main↔renderer contract, imported by both sides               |
| `src/renderer/`     | React views: preset editor, stats, transition overlay            |
| `e2e/`              | Playwright driving the real app (menubar, overlay)               |
| `scripts/icon/`     | Draws every icon the app ships; run by `pnpm icons`              |

Anything Electron-shaped is reached through a port, and each port has exactly two
adapters: the real one, and an in-memory one used by a test.

| Port             | Real                                | Declared in                   |
| ---------------- | ----------------------------------- | ----------------------------- |
| `MenubarSurface` | `Tray` + `Menu`                     | `src/main/menubar/surface.ts` |
| `AlertSurface`   | `Notification` + the overlay window | `src/main/alert/present.ts`   |
| `RequestSink`    | `ipcMain.handle`                    | `src/main/ipc/index.ts`       |
| `ViewTarget`     | a window's `webContents`            | `src/main/ipc/broadcast.ts`   |

## Testing

The phase machine is pure logic over time. **Never call `Date.now()` inside it** —
take a clock as a parameter. That rule is what keeps the suite fast and
deterministic; without it every test needs a real `sleep`.

**The seam goes around Electron, not around purity.** A module that imports
`electron` can hold no decisions: what the menubar says, what the notification
says, which channel does what, and when the menu is worth rebuilding are all
decided above the ports above, and all tested. `src/main/wire.ts` is where they
are joined, and `wire.test.ts` drives the real phase machine and the real history
log through fake surfaces — which is the only test that can say a phase boundary
reaches a notification, the log, and every open window.

The residue is deliberate: `index.ts`, `windows.ts`, and the three `surface.ts` /
`sink.ts` adapters have no unit tests because they contain nothing but Electron
calls. If a decision starts creeping into one of them, it is in the wrong file.

- `pnpm vitest run` — main-process logic (node env) and renderer views (jsdom)
- The pushed timer view has one fixture, `src/shared/test-support/timer-view.ts`,
  used by both suites: a field added to `TimerView` should be one edit, not six
  hand-written literals that quietly drift apart
- `pnpm e2e` runs against the bundles in `out/`, so build before running it or
  the suite grades the previous renderer
- Timelines worth arguing about get vitest snapshots
- Loop and boundary behaviour gets `fast-check` property tests
- `pnpm e2e` — the real app; `pnpm e2e:smoke` is the pre-push subset

macOS exposes no API for reading the menubar from outside the app, so
`src/main/index.ts` installs a `globalThis.__klokkiTest` seam when `KLOKKI_E2E=1`.
It reads the real thing — the menubar's own title, the real `Menu` template, the
live overlay window — because asking the model instead would only prove the model
agrees with itself.
The e2e suite reads tray state through it via `app.evaluate`, which runs in the
main process. Two rules keep that suite honest: each test launches with its own
`--user-data-dir` (Klokki's single-instance lock is keyed on it), and `launch()`
waits for the seam to appear, because `electron.launch()` resolves before
`app.whenReady()` has run.

## Decisions worth not re-litigating

- **Electron, not Tauri.** Chosen because Playwright can drive a real Electron
  window on macOS while `tauri-driver` cannot, and the tray and always-on-top
  overlay are exactly the platform-fiddly surfaces that need automated tests.
- **Editing a preset never disturbs a run in progress.** A save is visible in
  the tray immediately, but the running timer keeps the phase list it started
  with until it is restarted — a phase that shortened under the user's feet would
  fire at once, and one that lengthened would move a break they were counting on.
  `startPresetById` reads the store at the moment of the start, so the next start
  picks the edit up. Deleting the running preset does not stop the timer.
- **State main owns is pushed, never inferred.** Anything a window has to keep
  fresh while it is open is a channel in `PUSH` (`src/shared/ipc.ts`): the timer
  view, the preset list, and the fact that a line landed in the log. A view that
  reads once on mount is showing what was true when it opened, and a view that
  derives one push from another gets it wrong at the edges — "a stretch was
  logged" is not "the phase label changed", because a snooze and two phases
  sharing a label both write without changing it. `usePresets` reads once and then
  subscribes, the same shape as the timer view, so a window is never blank while
  it waits for the first push.
- **A boundary waits to be confirmed; nothing starts behind the user's back.**
  A phase that elapses puts the machine in `awaiting` (`src/main/timer/machine.ts`):
  the phase that ended is logged and announced, the phase that follows is chosen
  but not started, and no time passes until `confirm` — dismissing the overlay
  (`IPC.dismissAlert`), the tray's "Start <phase>", or `IPC.confirmNext` from the
  Timer pane. The next phase then gets its full configured length from the moment
  of the answer, because minutes spent noticing an overlay are not minutes of the
  break it was announcing. Consequences worth knowing: one tick reports at most
  one transition, a machine asleep for an hour comes back with one boundary to
  answer rather than a night of phases already spent, and `TimerView.awaiting`
  exists so no view draws a frozen countdown as a live one.
- **A skip is a boundary the user asked for.** `skip` (tray menu and settings
  window, via `IPC.skipPhase`) ends the phase now and starts the next one at its
  full configured length — for standing up before the sitting phase is out. It
  raises no notification and no overlay, because the user just chose it, and it
  is logged as its own `skipped` outcome for the minutes that really passed:
  `Transition.cause` is what tells `alertFor` to stay quiet and `recordHistory`
  which outcome to write. An elapsed boundary is drained first, so a skip taken a
  second after one the poll had not reported yet lands on the phase the user was
  actually looking at — and at a boundary still waiting to be answered, skipping
  and confirming are the same move, so `skip` confirms rather than inventing a
  phase to cut short.
- **The tray starts reminders too.** Reminders sit under a `Reminders` heading in
  the tray menu, one item each, and clicking one enables it and schedules it a
  full interval from now (`src/main/reminders/start.ts`) — "Restart" for one
  already scheduled, the same promise the preset items make. Acting without
  opening a window is what the menubar is for, and half the app was missing from
  it. The menubar therefore subscribes to the reminder view source, because
  whether an item says Start or Restart is a fact about the live schedule.
- **The settings window is a rail and one pane.** Four destinations — Timer,
  Presets, Stats, General — sit in a permanent left rail (`src/renderer/src/Rail.tsx`),
  and the pane on the right is the only one mounted. Which pane is open is the
  one piece of state the renderer owns outright: nothing outside the window can
  change it and the main process has no opinion on it. A pane that is not on
  screen therefore holds no subscription, and coming back to one reads and
  re-subscribes rather than showing what was true when the window opened — the
  same shape every pane already had for being reopened.
- **The phase sequence is pushed, like everything else the timer knows.** The
  Timer pane draws the running preset's phases as one bar at their real
  proportions, so `TimerView` carries `phases`, `phaseIndex`, `loop` and
  `phaseProgress`. All four are the machine's to answer: the phase list a run is
  on is not the one in the store the moment a preset is edited mid-run, and
  `phaseProgress` is a fraction rather than a length so no view divides one clock
  reading by another — and so a snoozed stretch, longer than its phase is
  configured to be, still fills the bar exactly once (`stretchProgress`).
- **One palette, named by role.** Every colour, and both type families, are
  `@theme` tokens in `src/renderer/src/index.css` — `ground`, `panel`, `line`,
  `ink…`, and two accents (`work`, `rest`) that share a lightness and a chroma
  and differ only in hue, so neither outweighs the other. A screen that reaches
  for a Tailwind palette shade is inventing a fifth grey. Icons are drawn in
  `src/renderer/src/icons.tsx` for the same reason the app icons are drawn by
  code: an icon font is a binary this repo would carry and never diff.
- **The menubar title names the phase, not just the number.** "29:14" does not
  say whether to sit or stand, which is the one thing a glance at the menubar is
  for. Each phase already carries a label — that label is the tray text, so
  naming a phase in the editor is how the user names what the menubar says.
- **Save is offered only when there is something to save.** The preset editor
  keeps the preset it opened alongside the draft and compares them
  (`samePreset`); a draft typed back into its original shape is not a pending
  edit, and a successful save makes the draft the new baseline. Validation is not
  part of that answer — an invalid edit still offers Save, because the reasons it
  cannot be saved are what the user needs to see.
- **A snooze answers whether it happened.** `service.snooze()` and
  `snoozeAlert()` return a boolean: the machine declines a boundary whose deferred
  end has already gone by, and that is a different event from a snooze that
  worked. The overlay closes either way — one naming a boundary long past is worse
  than none.
- **The preset list has one owner.** `createPresetStore` holds it, writes
  `presets.json`, validates every save (`validatePreset` in `src/shared/preset.ts`,
  so the form and the file agree), and notifies subscribers — which is how the
  tray menu rebuilds without a relaunch. Nothing else reads the file after launch.
- **Launch at login is read from macOS, never remembered.** The toggle asks the OS
  on mount and re-reads it after every write, so removing the login item in System
  Settings cannot leave the checkbox lying (`src/main/login-item.ts`).
- **Wall-clock timing.** The timer keeps running through sleep; the user restarts
  a preset manually if drift makes a phase meaningless. Likely to change.
  Consequence: `tick()` is asked about a `now` that may be hours past the phase it
  is running, so it must end that phase at its own configured end rather than at
  the moment the poll noticed — which is also why a confirmed phase starts at the
  confirmation and a snoozed one at the boundary it deferred, never at a poll
  tick. Nothing behind an unanswered boundary can have elapsed, so draining more
  than one phase per tick is not a case that exists.
- **An overlay is sized to the alert it shows, and “later” is one control.**
  The three overlays share a shape — title, rows, then a footer of Snooze on the
  left and the affirmative on the right — so a user who has learnt one has
  learnt all three. Sports is the only one whose content grows, and one row per
  activity (name left, field right) grows it in a direction the main process can
  predict: `src/shared/overlay-size.ts` turns the alert into a window height,
  because the activity count is known before the window opens and a window
  measured after paint resizes under the user. The snooze increments are one
  segmented control rather than a button each — three buttons reading
  “Snooze 5 minutes” ran wider than the window and wrapped the footer, which is
  exactly the content whose height nothing could predict. The height stops
  growing at 80% of the work area, and past that the rows scroll inside the
  window: an alert whose footer is off screen has no reachable way out, and
  Snooze and Done are the only two there are.
- **Transitions are intrusive.** Native notification _plus_ a borderless
  always-on-top overlay that must be dismissed or snoozed. A notification alone
  is missed in Do Not Disturb and fullscreen — the exact moments it matters.
- **Snooze defers a boundary; it never skips a phase.** The run is holding at the
  boundary when the overlay is answered, so `snooze` re-ends the phase that
  finished five minutes after the boundary — not five minutes after the click,
  which would let click latency drift the rest of the sequence. The phase that
  follows keeps its full length, because its length is applied when it finally
  starts. `+5 min` at a waiting boundary is the same move under a different name
  (`deferBoundary`), which is why the tray can offer it there. A snooze whose new
  end is already in the past is declined, and a second click on one overlay
  extends the current snooze instead of stepping back twice: a snooze must only
  ever move time forwards.
- **A reminder waits for its answer before starting the next interval.** A fired
  step leaves its run with `nextFireAt: null` until Done (`withConfirmed`) or
  Snooze answers it, so an interval is never spent ignoring an overlay and a
  reminder whose interval passed six times while the app was closed asks once.
  The engine's schedule therefore changes without anything coming due, which is
  what `ReminderService.onScheduleChange` is for: persistence and the pushed list
  follow the schedule, and only the overlay follows the firings. `ReminderView`
  carries `awaiting` because "waiting for you" and "not scheduled" are different
  things for a row to say.
- **The stats pane reads the three logs as one week.** Phases, reminders and
  Sports each have their own log and their own summariser, but the day a stretch
  of standing landed on is the day the pushups did or did not — so the pane joins
  them on the calendar day (`zipWeek` in `src/renderer/src/week.ts`) and draws
  one row per day, not three lists of `YYYY-MM-DD`. Phase minutes are what a row
  is drawn at, scaled to the busiest day of the week rather than to the day's own
  maximum, because a row is read against its neighbours; reps and kilometres are
  counted beside them, because they share no scale with minutes. A label's accent
  comes from the week's ranking of it and never from its position within a day,
  which is sorted by that day's minutes and would swap two labels between rows.
  The join and the sums are the only derivation the renderer does, and they are
  arithmetic over one payload — never a fact inferred from the timer or from a
  second push. `STATS_DAYS` therefore lives in `src/shared/history.ts`: all three
  windows have to be the same window, and the view divides by it to average.
- **History is local and append-only** (`history.jsonl`). Append-only survives a
  kill mid-write; stats read the tail. Stats cover today + 7 days, which is why
  no query engine is needed. A line is written when a stretch of phase _ends_,
  never when it starts, so nothing is buffered and a snoozed stretch records the
  five minutes it actually granted rather than a second full-length phase —
  which is why `Transition` carries `startedAt` and `presetId`. A day is walked
  on the calendar, not by subtracting 24 hours, because daylight saving makes a
  day 23 or 25 hours long; `summarise` takes both the clock and the zone as
  parameters so every boundary case is a test, not a wait.
- **Every icon is drawn by code**, never committed as artwork (`pnpm icons`).
  The mark is a clock ring with a K inside it; the app icon breaks the ring with two
  notches — a long work arc and a short break arc — on an Ink squircle. The PNG
  and `.icns` encoders are written out in `scripts/icon/` rather than shelled out
  to `iconutil` or pulled from an image library, which is what keeps the format
  under test and the repo free of opaque binaries. The tests still ask `sips` and
  `iconutil` whether the bytes are a file the platform accepts — the one check an
  encoder cannot make about itself — and skip that question where those binaries
  do not exist (`scripts/icon/test-support/macos.ts`), because CI runs everything
  platform-independent on Linux and a missing oracle is not a failing encoder. The menubar templates in
  `resources/` are committed because they are loaded at runtime; `build/icon.icns`
  is generated at package time and ignored.
- **A dial with hands names no timer; the K does.** Two hands on a ring is what
  every interval timer's menubar glyph is, so it identifies nothing — and at 22px
  two strokes of equal weight leaving the centre merge into a wedge whatever the
  pose. The mark is the letter inside the dial instead, which reads by shape
  rather than by the angle between two lines, and is the only part of the icon
  that is Klokki's.
- **The menubar glyph and the app icon share geometry, not weight.** A hairline
  that looks right at 1024px is invisible at 22px, so the app icon's stroke is
  optically sized — each slot drawn at the weight its _point_ size wants, which
  is why a 16pt @2x slot is not just the 32pt one. The glyph pays for its heavier
  stroke with detail: it drops the notches, which need a gap wider than the
  stroke around them and have no room at 22px, and it widens the dial so the
  letter inside still clears the ring. Both proportions live in `draw.ts`; the
  gap between letter and ring is the thing the tests pin, because a stroke heavy
  enough to close it turns the glyph into a blob.
- **oxlint only**, `--type-aware`. No typescript-eslint: the second linter is
  config surface and CI seconds for no coverage this project misses.
- **Local-only distribution.** arm64, unsigned, no notarization. macOS will warn
  on first launch; right-click → Open once.

## Issues

Work is tracked as markdown files, not on a remote tracker.

- `issues/open/` — not started or in progress
- `issues/done/` — **move** the file here when it is finished; do not delete it
  and do not leave a copy behind

Files are numbered in dependency order and carry a `**Type:**` of AFK
(mergeable without a human) or HITL (needs a human decision or review). Each one
states what to build, its acceptance criteria, and what blocks it. Tick the
acceptance criteria in the file as they land, and check the `Blocked by` list
before picking something up.

## Paths at runtime

`app.getPath('userData')` = `~/Library/Application Support/Klokki/`

- `presets.json` — carries `schemaVersion`
- `history.jsonl` — one ended stretch of phase per line, `completed`, `snoozed`
  or `skipped`
