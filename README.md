# Klokki

Klokki is a menubar interval timer for macOS. It counts down a list of phases —
Focus 25 minutes and Break 5 minutes, Sitting 30 minutes and Standing 15
minutes, or a sequence that you write. The menubar shows the phase and the time
that is left. At the end of a phase, Klokki gives a notification and an overlay
that stays above every other window until you answer it. The next phase starts
when you answer, so a break that you start late is still a full break.

Two more schedules run beside the timer. A reminder cycles its own steps on its
own interval, for example `Look 20ft away` every 20 minutes. Sports asks about
all activities at one interval and records the quantity that you enter. You can
start a preset, a reminder or Sports from the menubar menu. Klokki writes each
phase, each reminder step and each Sports entry to a local log, and the Stats
pane reads the last 7 days of all three.

<p align="center">
  <img src="docs/screenshots/timer.png" width="32%" alt="The Timer pane, with a Pomodoro preset in its Focus phase">
  <img src="docs/screenshots/sports.png" width="32%" alt="The Sports pane, with a countdown and three activities">
  <img src="docs/screenshots/stats.png" width="32%" alt="The Stats pane, with today and the last 7 days">
</p>

## Requirements

macOS on Apple Silicon, Node 24 or later, pnpm 11 or later.

## Commands

```sh
pnpm install
pnpm dev          # electron-vite, with hot reload on main and renderer
pnpm icons        # draw the menubar images; the repository holds no artwork
pnpm build:mac    # an unsigned .dmg in dist/
pnpm screenshots  # the images above, captured from the real app after pnpm build
```

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm vitest run`, `pnpm knip`, and
`pnpm e2e` after a `pnpm build`.

The `.dmg` is unsigned on purpose, because distribution is local only. macOS
refuses to open an unsigned app on the first attempt. To open it, hold Control,
click the app, and select **Open**.

## Architecture

The state and the clock live in the Electron main process. The renderer is a
sandboxed view that talks through one typed bridge. For the full design, read
[AGENTS.md](./AGENTS.md). Work is tracked as markdown files in
[`issues/`](./issues).
