# Klokki

Menubar interval timer for macOS — Pomodoro, sit/stand, and custom phase sequences.

Klokki lives in the menubar and counts down phases: 25 min work / 5 min break, or
30 min sitting / 15 min standing, or whatever sequence you define. Each transition
fires a notification and an overlay you have to acknowledge or snooze, because a
health timer you can ignore is not a health timer.

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

## Architecture

State and time live in the Electron main process; the renderer is a sandboxed
view that talks through one typed bridge. See [AGENTS.md](./AGENTS.md).
