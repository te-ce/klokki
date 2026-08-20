# Live timer state in the settings window

**Type:** AFK

## What to build

Open the main→renderer channel and prove it with the smallest complete feature:
the settings window shows what the timer is doing right now, and can start and
stop it.

The main process already owns the timer and emits an update every second. This
slice pushes those updates to any open window, and extends the preload bridge
with the calls a view needs — read the current view, start a preset, stop. The
renderer holds no timer of its own: no `setInterval`, no derived countdown, no
copy of the phase list. It renders what arrives.

Every renderer feature after this one depends on this channel, so the
housekeeping matters: a closed window must stop receiving updates, and reopening
must show current state immediately rather than waiting for the next tick.

## Acceptance criteria

- [x] With a preset running, opening the settings window immediately shows the
      preset name, the current phase and the countdown — without waiting a second
- [x] The countdown in the window advances on its own while the window is open
- [x] Starting and stopping a preset from the window is reflected in the menubar
      title, and vice versa
- [x] Closing the settings window unsubscribes it; no updates are sent to a
      destroyed window and no listeners accumulate across open/close cycles
- [x] The renderer contains no timer or countdown arithmetic of its own
- [x] An e2e test opens the window from the tray and observes the countdown
      changing

## Blocked by

- 01-presets-persisted-to-disk.md
