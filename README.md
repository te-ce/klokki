# Klokki

Menubar interval timer for macOS — Pomodoro, sit/stand, and custom phase sequences.

Klokki lives in the menubar and counts down phases: 25 min work / 5 min break, or
30 min sitting / 15 min standing, or whatever sequence you define. Each transition
fires a notification and an overlay you have to acknowledge or snooze, because a
health timer you can ignore is not a health timer.

The next phase waits for that acknowledgement rather than starting behind it, so
a break you answer five minutes late is still a whole break. Until then the
menubar reads "Break ready", and the tray menu, the overlay and the Timer pane
all offer to start it.

Alongside the phase timer, standalone reminders cycle their own steps on an
interval (e.g. "look 20ft away" every 20 minutes) independent of any preset.
Reminders start from the tray menu like presets, and their next interval starts
when you answer the one that fired.

Settings window has four panes — Timer, Presets, Reminders, Stats — and a
7-day history of every phase and reminder logged locally.

## Requirements

- macOS on Apple Silicon
- Node 24+, pnpm 11+

## Development

```sh
pnpm install
pnpm icons     # regenerate the menubar template images
pnpm dev       # electron-vite dev, with HMR on main and renderer
```

## Checks

```sh
pnpm lint        # oxlint, type-aware
pnpm typecheck   # tsc -b
pnpm vitest run  # main-process logic + renderer views
pnpm e2e         # Playwright against the real app (needs pnpm build first)
pnpm knip        # unused files, exports, dependencies
```

## Install locally

```sh
pnpm build:mac
```

Produces an unsigned `.dmg` in `dist/`. It is unsigned on purpose (local-only
distribution), so the first launch needs right-click → Open.

## Status

Feature-complete for v0: presets, the preset editor, transition notification +
overlay with snooze, interval reminders with their own settings pane,
`history.jsonl` with the 7-day stats view, launch-at-login, and a drawn app icon.
Work is tracked as markdown files in [`issues/`](./issues) — `open/` for what's
next, `done/` for what's shipped.

## Architecture

State and time live in the Electron main process; the renderer is a sandboxed
view that talks through one typed bridge. See [AGENTS.md](./AGENTS.md).
