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

| Path                | Role                                                          |
| ------------------- | ------------------------------------------------------------- |
| `src/main/`         | Phase machine, presets, history, tray, windows. All the logic |
| `src/preload/`      | The only bridge: exposes `window.klokki` via `contextBridge`  |
| `src/shared/ipc.ts` | The main↔renderer contract, imported by both sides            |
| `src/renderer/`     | React views: preset editor, stats, transition overlay         |
| `e2e/`              | Playwright driving the real app (tray, overlay)               |

## Testing

The phase machine is pure logic over time. **Never call `Date.now()` inside it** —
take a clock as a parameter. That rule is what keeps the suite fast and
deterministic; without it every test needs a real `sleep`.

- `pnpm vitest run` — main-process logic (node env) and renderer views (jsdom)
- Timelines worth arguing about get vitest snapshots
- Loop and boundary behaviour gets `fast-check` property tests
- `pnpm e2e` — the real app; `pnpm e2e:smoke` is the pre-push subset

macOS exposes no API for reading the menubar from outside the app, so
`src/main/index.ts` installs a `globalThis.__klokkiTest` seam when `KLOKKI_E2E=1`.
The e2e suite reads tray state through it via `app.evaluate`, which runs in the
main process. Two rules keep that suite honest: each test launches with its own
`--user-data-dir` (Klokki's single-instance lock is keyed on it), and `launch()`
waits for the seam to appear, because `electron.launch()` resolves before
`app.whenReady()` has run.

## Decisions worth not re-litigating

- **Electron, not Tauri.** Chosen because Playwright can drive a real Electron
  window on macOS while `tauri-driver` cannot, and the tray and always-on-top
  overlay are exactly the platform-fiddly surfaces that need automated tests.
- **Wall-clock timing.** The timer keeps running through sleep; the user restarts
  a preset manually if drift makes a phase meaningless. Likely to change.
  Consequence: `tick()` must drain _every_ phase that elapsed since the last
  call, not assume one tick is one phase, and each phase starts at the previous
  phase's exact end so polling granularity cannot accumulate drift.
- **Transitions are intrusive.** Native notification _plus_ a borderless
  always-on-top overlay that must be dismissed or snoozed. A notification alone
  is missed in Do Not Disturb and fullscreen — the exact moments it matters.
- **History is local and append-only** (`history.jsonl`). Append-only survives a
  kill mid-write; stats read the tail. Stats cover today + 7 days, which is why
  no query engine is needed.
- **oxlint only**, `--type-aware`. No typescript-eslint: the second linter is
  config surface and CI seconds for no coverage this project misses.
- **Local-only distribution.** arm64, unsigned, no notarization. macOS will warn
  on first launch; right-click → Open once.

## Paths at runtime

`app.getPath('userData')` = `~/Library/Application Support/Klokki/`

- `presets.json` — carries `schemaVersion`
- `history.jsonl` — one completed (or snoozed) phase per line
