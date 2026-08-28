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
  picks the edit up. Deleting a preset does not stop the run it was driving.
- **Several presets run at once, and a run is named by its preset.** The timer
  service is a keyed collection of phase machines (`src/main/timer/service.ts`),
  one entry per running preset, and `TimerView` is `{ runs }` — a list, in the
  order the runs were started. A run in that list is running by being there, so
  there is no `running` flag and "nothing is running" is `runs.length === 0`,
  read off the one payload rather than pushed as a second fact. The key is the
  preset id, which means **starting a preset that is already running restarts it
  rather than adding a second copy**: two runs of "Pomodoro" would be
  indistinguishable in the tray title and in the Timer pane, and every history
  line is already keyed by `presetId`, so a second copy would be unattributable
  in Stats. `Map.set` on a key already there leaves it in place, which is what
  keeps a restart from reshuffling the menubar title under the user. Every
  run-scoped command therefore names its run rather than implying a current one —
  `stopTimer`, `skipPhase`, `confirmNext`, `setRemaining`, `addTime`,
  `dismissAlert`, `snoozeAlert`, `stopFromAlert`, and the tray's per-run
  Stop/Skip/+5 — and an id that is no longer running is a no-op answering
  `false`, because a window or a menu can name a run that ended under it. The
  machine itself is untouched: a run is one machine, and the collection hands each
  state to the same pure functions a single run used.
- **Two boundaries at once: the second waits, it is never dropped.** The overlay
  is one window per kind and a new one supersedes the last (`windows.ts`), so a
  boundary raised while another run's overlay is on screen is queued
  (`src/main/alert/queue.ts`) rather than shown or lost. Losing it would break
  the guarantee above: a boundary holds its
  run until it is answered, so an alert nobody ever saw would leave a run parked
  with nothing to explain it. Queued is not hidden, either: the run is still
  `awaiting`, the tray names it (`<preset> — <phase> ready`, with
  `Start <phase> · <preset>` beside it) and the Timer pane offers it, so the
  boundary is answerable from two places while it waits its turn. `alertsFor`
  speaks once per run rather than once per batch, because two runs crossing a
  boundary in one poll are two things to be told and neither is news about the
  other. Answering is one move wherever it comes from — the overlay's three
  controls, the tray's Start/Skip/Stop, the Timer pane's buttons — and it all
  reaches `answered(runId)`, which voids that run's alert only if it is the one on
  screen and then brings the next boundary forward. That is also what stops a
  boundary confirmed from the tray from leaving its overlay standing over a phase
  that has already begun, and what stops a boundary answered from the pane from
  coming round later announcing one.
- **Every run is saved, so a restart brings all of them back.**
  `timer-state.json` holds `{ schemaVersion: 2, runs: [...] }` and
  `persistSnapshot` writes the whole collection after every change, because a run
  that ended has to disappear from the file and there is no per-run delete.
  Nothing running clears the file rather than writing it, so a finished or stopped
  run cannot resurrect on next boot. Resume drains each run's elapsed boundaries
  the way a poll drains one, independently: a run that finished while the app was
  shut is gone and its transitions still reach history and the alert surface, and
  one still in progress comes back counting. Every field is untrusted, and a run
  that does not decode is dropped **on its own** — starting one run short is safe,
  losing the others to one hand-edited entry is not. A v1 file held a single
  `state`, which reads as a one-run list, so a preset left running before the
  update is still running after it.
- **State main owns is pushed, never inferred.** Anything a window has to keep
  fresh while it is open is a channel in `PUSH` (`src/shared/ipc.ts`): the timer
  view — every run in it — the preset list, and the fact that a line landed in
  the log. A view that
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
  one transition per run, a machine asleep for an hour comes back with one
  boundary per run to answer rather than a night of phases already spent, and
  `RunView.awaiting` exists so no view draws a frozen countdown as a live one.
- **A skip is a boundary the user asked for.** `skip` (tray menu and settings
  window, via `IPC.skipPhase`) ends the phase now and starts the next one at its
  full configured length — for standing up before the sitting phase is out. It
  raises no notification and no overlay, because the user just chose it, and it
  is logged as its own `skipped` outcome for the minutes that really passed:
  `Transition.cause` is what tells `alertsFor` to stay quiet and `recordHistory`
  which outcome to write. An elapsed boundary is drained first, so a skip taken a
  second after one the poll had not reported yet lands on the phase the user was
  actually looking at — and at a boundary still waiting to be answered, skipping
  and confirming are the same move, so `skip` confirms rather than inventing a
  phase to cut short.
- **The settings window is a rail and one pane.** Four destinations — Timer,
  Presets, Stats, General — sit in a permanent left rail (`src/renderer/src/Rail.tsx`),
  and the pane on the right is the only one mounted. Which pane is open is the
  one piece of state the renderer owns outright: nothing outside the window can
  change it and the main process has no opinion on it. A pane that is not on
  screen therefore holds no subscription, and coming back to one reads and
  re-subscribes rather than showing what was true when the window opened — the
  same shape every pane already had for being reopened.
- **The phase sequence is pushed, like everything else the timer knows.** The
  Timer pane draws each running preset's phases as one bar at their real
  proportions, so `RunView` carries `phases`, `phaseIndex`, `loop` and
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
- **The menubar title names the phase, not just the number — and every run.**
  "29:14" does not say whether to sit or stand, which is the one thing a glance
  at the menubar is for. Each phase already carries a label, and that label is
  the tray text, so naming a phase in the editor is how the user names what the
  menubar says. With several presets running the title is all of them joined by
  `·` (`RUN_SEPARATOR`), in the order they were started — `Sit 29:14 · Focus
04:02` — rather than one headline with the rest hidden: a timer the user
  started and cannot see is a timer they have stopped trusting, and the menubar
  is the whole UI. Nothing is dropped or elided in code. A title long enough to
  crowd the bar is elided by macOS itself, from the right, and the menu below it
  carries a section per run, so a run pushed off the end of the title is still
  named there, still answerable, and never only in the title. With no runs the
  title is empty, exactly as it was with one timer, and each run reads
  `<phase> ready` rather than a frozen countdown while it holds at a boundary.
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
  than one phase of one run per tick is not a case that exists — but one tick
  drains every run, against a single reading of the clock, because two runs that
  ended together must not be logged as ending a tick apart.
- **An overlay is sized to the alert it shows, and “later” is one control.**
  The two overlays share a shape — title, rows, then a footer of Snooze on the
  left and the affirmative on the right — so a user who has learnt one has
  learnt the other. Sports is the only one whose content grows, and one row per
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
- **Every alert can stop the thing that raised it.** The overlay was the one
  place the user could not say "not today": Snooze and the affirmative were the
  only answers, so stopping meant finding the tray behind a window that sits
  above everything. Each overlay now has a third control — the transition's
  stops the timer, Sports' disables Sports — and each takes the path the tray
  already took (`service.stop`, `stopSports`) plus the close the overlay would
  otherwise wait forever for. `IPC.stopFromAlert` and `IPC.stopSportsFromAlert`
  exist because "stop it and close me" is one move and the existing channels
  are only half of it; `stopTimer` and `stopSports` are untouched. The
  transition overlay carries an id, `Alert.runId`, because it is opened with
  the alert in its URL: the run whose boundary this window is announcing is a
  fact about the window, not about whichever run the main process saw last.
  Disabling is the whole stop for Sports, because the store's subscriber is
  what drops the schedule, which is also what keeps a stopped firing from
  being left awaiting an answer that can no longer be given. A stop writes no
  history: it is neither a "done" nor a "later", and minutes that were not
  spent are not a stretch. The transition overlay offers it only while a phase
  is still to come, for the same reason its snooze is left off a run that has
  already finished.
- **Stop is the quietest control in the footer, and the furthest from the
  affirmative.** It is text where Done is filled, and at the opposite end, because
  it is the one answer waiting cannot undo — and the visible glyph is "Stop" with
  what is stopped in the accessible name (`OverlayStop`), the same split
  `SnoozeChoice` makes with its increments. Three controls do not fit the 420px
  window the two did, so `OVERLAY_WIDTH` is 480: a footer that wraps is a height
  nothing above the renderer can predict, which is the same failure a button per
  snooze increment caused.
- **The notification carries the same Stop the overlay does.** It is a
  `Notification` action, so the alert can be answered without the overlay ever
  being looked at — and it must not be a second way to stop anything, so its
  label is decided with the rest of the wording (`notification.ts`) and its
  effect is literally the overlay's own path. `NotificationText.actions` pairs a
  label with a callback and `alert/notify.ts` turns the pair into a platform
  button, which is what keeps the adapter free of both decisions. macOS shows the
  first action inline; a platform that ignores actions loses nothing but the
  shortcut, because the overlay half is the requirement and stands on its own.
- **A stop voids the alert of the thing it stopped — both halves of it.** An
  alert that outlives its source is worse than none: it names a boundary that no
  longer exists, its Snooze can only be declined, and its affirmative would
  answer a run that is gone. So a stop closes the overlay _and_ withdraws the
  native notification, wherever the stop was made — the tray, the settings
  window, a delete, or the alert's own Stop. Withdrawing is the one part only the
  platform can do, and only through the handle it kept: `createNotifier` in
  `alert/notify.ts` holds it and each surface has its own, so withdrawing the
  timer's notification cannot clear Sports', while `voidAlert` (`alert/void.ts`)
  is the decision — one alert, shown in two places, hidden in both — and is
  what every path reaches. Which path is the honest trigger differs by kind,
  and neither is a `close()` remembered at a call site: Sports stops by a
  store write, so its store subscription in `wire.ts` voids the alert of
  anything no longer running and covers the tray, the toggle and a delete at once
  (`voidStopped` is told what _is_ running, because "not in the list" is how a
  delete reads); the timer has no store, so one `stopTimer` closure is what the
  tray, `IPC.stopTimer` and `IPC.stopFromAlert` all call, which is why those two
  channels are now the same move. It cannot be a subscription to the timer
  service instead, because a run reaching its own last phase also lands on idle,
  and "Timer finished" is the one alert the user still wants standing. Only the
  matching alert is voided: the overlay windows are already separate per kind, and
  within a kind the controller answers which one it is showing — Sports by the
  same ownership its Stop already had, and the timer by `wireAlerts`' queue —
  so a run stopped while a second run's boundary is on screen leaves that
  overlay alone and merely drops itself from the queue it was waiting in.
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
- **The stats pane reads both logs as one week.** Phases and Sports each have
  their own log and their own summariser, but the day a stretch of standing
  landed on is the day the situps did or did not — so the pane joins them on
  the calendar day (`zipWeek` in `src/renderer/src/week.ts`) and draws one row
  per day, not two lists of `YYYY-MM-DD`. Phase minutes are what a row
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
  The mark is the letter K with its two arms struck as arcs rather than straight
  strokes; the app icon sets it in white on an Ink squircle. The PNG
  and `.icns` encoders are written out in `scripts/icon/` rather than shelled out
  to `iconutil` or pulled from an image library, which is what keeps the format
  under test and the repo free of opaque binaries. The tests still ask `sips` and
  `iconutil` whether the bytes are a file the platform accepts — the one check an
  encoder cannot make about itself — and skip that question where those binaries
  do not exist (`scripts/icon/test-support/macos.ts`), because CI runs everything
  platform-independent on Linux and a missing oracle is not a failing encoder. The menubar templates in
  `resources/` are committed because they are loaded at runtime; `build/icon.icns`
  is generated at package time and ignored.
- **A dial names no timer; the K does.** A ring, a pie, an hourglass, two hands
  — every interval timer's glyph is one of them, so none of them identifies this
  one. The mark is the letter alone, bowed: the arms are arcs of a circle struck
  through their own two ends (`ARM_BOW` in `scripts/icon/mark.ts`), which
  is the only part of it that could not have been anyone else's K. There is no
  ring, which is also what lets the menubar glyph and the app icon share the
  geometry exactly.
- **The menubar glyph and the app icon share geometry, not weight.** A hairline
  that looks right at 1024px is invisible at 22px, so the app icon's stroke is
  optically sized — each slot drawn at the weight its _point_ size wants, which
  is why a 16pt @2x slot is not just the 32pt one. The glyph takes a single
  heavy weight instead, and the mark has no detail to drop for it: one letter is
  one letter at either size. What does differ is inset — the menubar pads its
  own 22px, so the glyph is drawn across the whole canvas while the app icon
  scales the letter down inside its squircle. Both proportions live in
  `draw.ts`. The tests pin the counter between the two arms, because a stroke
  heavy enough to close it turns the glyph into a blob, and the bow itself,
  because an arm that straightens is just a K.
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
- `timer-state.json` — every run in progress, so a restart resumes all of them
- `history.jsonl` — one ended stretch of phase per line, keyed by `presetId`,
  `completed`, `snoozed` or `skipped`
