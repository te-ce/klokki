# Reminders settings pane

**Type:** AFK

## What to build

A fifth rail destination, "Reminders", alongside Timer / Presets / Stats /
General — reminders are their own concept (own list, own create form, no tray
presence) and don't belong folded into Presets.

List view: each reminder's name, interval, its steps in order, an enabled/
disabled toggle, and its next-fire time (cheap to show since the engine already
tracks it, and useful confirmation that a reminder is actually scheduled).

Create/edit form: name, interval (minutes), an ordered list of steps — each a
label and an optional unit — addable/removable/reorderable the way preset
phases already are, and an enabled toggle. Saving goes through the reminders
IPC from 08; the list subscribes to the `reminders` push, the same
read-once-then-subscribe shape every other pane in this window already uses.

Delete removes a reminder (and its schedule) outright — no confirmation beyond
what preset deletion already does.

## Acceptance criteria

- [ ] Reminders rail entry exists and its pane opens/subscribes only while
      visible, matching the other panes
- [ ] Reminder list shows name, interval, steps, enabled state and next-fire time
- [ ] Create/edit form supports an ordered, reorderable step list, each step with
      a label and optional unit
- [ ] Enabling/disabling a reminder from the list takes effect immediately
      (reflected in `nextFireAt` scheduling from 08)
- [ ] Delete removes the reminder and cancels its schedule
- [ ] Renderer tests cover the form and list the way `PresetsSection.test.tsx`
      covers preset editing

## Blocked by

- 08-reminder-engine-and-persistence.md
