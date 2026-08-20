# Preset editor + General settings

**Type:** AFK

## What to build

The settings window gains the reason it exists: editing presets. A preset is a
name, an ordered list of phases (label, minutes, notify) and a loop flag, so the
editor is a list-of-rows form — add a phase, edit it, reorder it, delete it,
rename the preset, toggle looping. Create and delete whole presets too.

Writes go through the bridge to the main process, which owns `presets.json`.
Saving must be visible in the menubar without a relaunch: the tray menu rebuilds
from the new list.

Validation belongs in the shared model, not only in the form: a preset with no
phases, or a phase of zero minutes, can never make progress and must be
rejected with a message rather than saved and later crashing the timer.

This slice also carries the small General section, since it is the same window:
a launch-at-login toggle, default off. The toggle reflects the real OS login-item
state rather than a value the app remembers separately, so flipping it outside
the app does not leave the UI lying.

## Acceptance criteria

- [ ] A user can create a preset, name it, add and reorder phases, set each
      phase's label / minutes / notify flag, toggle looping, and delete it
- [ ] Saving updates `presets.json` and the tray menu immediately — no relaunch
- [ ] Editing the preset that is currently running is possible, and the running
      timer's behaviour after the edit is defined and tested (either applies at
      the next phase or requires a restart — pick one and document it)
- [ ] A preset with no phases or a zero-minute phase cannot be saved, and the
      form says why
- [ ] The General section has a launch-at-login toggle, off by default, whose
      state is read from the OS login-item settings
- [ ] Component tests cover the validation paths; the editor's IPC calls are
      exercised against a fake bridge

## Blocked by

- 01-presets-persisted-to-disk.md
- 02-live-timer-state-in-settings-window.md
