# Interval reminders — engine and persistence

**Type:** AFK

## What to build

A reminder is not a preset. The phase machine assumes a tray countdown and only
knows `elapsed` / `skipped` transitions plus a `completed | snoozed | skipped`
history outcome — there is no room in it for "the user typed a number when this
fired", and a reminder has no tray title to show. So this is a second, independent
engine, not a new kind of phase.

`ReminderDefinition`: `{ id, name, intervalMinutes, steps, enabled }`. `steps` is
an ordered, cycling list of `{ label, unit? }` — one step fires per interval,
then the cursor advances to the next step (wrapping at the end), which is how
"pushups, then squats, then pushups again" is represented: two steps, cursor
alternates. `unit` is optional; a step with no unit is plain done/not-done (e.g.
"drink a glass of water"), one with a unit expects a quantity when it's marked
done (e.g. `unit: 'reps'`).

Definitions persist to `reminders.json` (own file, same shape as `presets.json`:
`schemaVersion` + array). Running state — each enabled reminder's `nextFireAt`
and current step cursor — persists too, so a reminder due in 90 minutes is still
due in 90 minutes after a relaunch, the same guarantee the running timer already
has. Reminders run concurrently and independently: there is no single "active
reminder" the way there is a single active timer, so N enabled reminders means N
independent schedules ticking at once.

The engine polls every enabled reminder's `nextFireAt` on the app's existing tick
loop (no second interval). When one elapses it emits a "reminder due" event
carrying the reminder id and current step, advances `nextFireAt` by
`intervalMinutes`, and advances the step cursor — regardless of how the user
eventually answers. A snooze reschedules the same due step at a new time; it does
not skip to the next step early.

IPC: request channels to list, create, update, delete and enable/disable a
reminder, plus a push channel for the reminder list (mirrors the existing
`presets` push) so an open Reminders pane updates without polling.

## Acceptance criteria

- [ ] `ReminderDefinition` and its persisted store (`reminders.json`,
      `schemaVersion`) exist, validated the way `validatePreset` validates presets
- [ ] Multiple reminders can be enabled and scheduled at once, independently
- [ ] Each reminder's `nextFireAt` and step cursor survive an app restart
- [ ] A step with no `unit` requires no quantity to mark done; a step with a
      `unit` is the one place a quantity is meaningful
- [ ] The engine emits a due event through the existing tick loop, not a new timer
- [ ] Answering a due event (see 09) advances the step cursor and reschedules
      `nextFireAt`; a snooze reschedules the same step rather than advancing it
- [ ] IPC: list/create/update/delete/enable reminders, plus a `reminders` push on
      any change
- [ ] Unit tests cover scheduling against a fixed clock, step-cursor wraparound,
      and restart persistence — no `Date.now()` inside the engine, a clock is
      passed in, matching the phase machine's rule

## Blocked by

(none — new area)
