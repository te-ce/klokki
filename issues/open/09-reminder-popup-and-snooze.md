# Reminder popup — snooze or log it done

**Type:** AFK

## What to build

Reuses the existing intrusive-alert shape (native notification + always-on-top
overlay) for reminder-due events, but the overlay content and the choice it
offers are different from the phase-transition overlay.

The reminder overlay shows the step's label and offers exactly two actions —
no plain dismiss, because a reminder that hasn't been done should always end in
either "later" or "done", matching the ask directly:

- **Snooze**: fixed increments (+5 / +10 / +15 minutes), same fixed-button
  convention as the phase overlay's snooze rather than free-text minutes.
- **Done**: for a step with a `unit`, a number input for the quantity is
  required before Done is enabled (e.g. how many pushups); for a step with no
  `unit`, Done needs no input.

If more than one reminder comes due before the user answers the current one,
queue them and show one overlay at a time in the order they fired — never stack
overlapping overlay windows.

Snooze and Done both close the overlay and answer the due event from 08: Done
records the outcome (with quantity if any) for history (see 11) and lets the
engine's normal advance stand; Snooze asks the engine to reschedule the same
step rather than advance past it.

## Acceptance criteria

- [ ] A reminder firing shows a native notification and the overlay, same
      trigger shape as a phase transition
- [ ] Overlay offers Snooze (+5/+10/+15) and Done; no separate dismiss
- [ ] Done is disabled until a quantity is entered when the step has a `unit`,
      and needs no input when it doesn't
- [ ] Two reminders due close together queue rather than opening two overlay
      windows at once
- [ ] Snooze re-fires the same step later; it does not skip to the next step
- [ ] A snooze whose new time would already be past is declined, matching the
      existing "a snooze must only ever move time forwards" rule
- [ ] Renderer test coverage for the overlay's states (no-unit step, unit step
      with/without a value entered, queued-second-reminder) mirrors the existing
      `TransitionOverlay` tests

## Blocked by

- 08-reminder-engine-and-persistence.md
