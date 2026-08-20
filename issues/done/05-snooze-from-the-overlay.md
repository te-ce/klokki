# Snooze 5 minutes from the overlay

**Type:** AFK

## What to build

Give the overlay a second button: Snooze 5 minutes. An alert that can only be
acknowledged gets rage-quit within a week, and an auto-dismissing one forfeits
the reason the overlay exists at all.

Snooze means "let me keep doing what I was doing" — it extends the phase that
just ended by five minutes and pushes the next phase's start back by the same
amount. It does not skip a phase and it does not shorten the phase that follows.

This is a phase-machine change, not only a UI one: the machine gains a way to
defer the current boundary, which means new state to keep and new invariants to
hold. Snoozing repeatedly must keep working without drifting the rest of the
sequence, and a snooze must never move time backwards.

## Acceptance criteria

- [x] The overlay offers Snooze 5 minutes alongside dismissal
- [x] Snoozing extends the just-ended phase by 5 minutes; the menubar countdown
      shows the extra time and the next phase starts 5 minutes later
- [x] The phase after the snoozed boundary keeps its full configured length
- [x] Snoozing several times in a row compounds correctly and never rewinds the
      timer
- [x] Property tests cover the invariants: a snooze never decreases elapsed time,
      and remaining time after a snooze never exceeds the phase duration plus the
      snooze
- [x] Snoozing is recorded as an outcome distinct from completing (consumed by
      the history log)

## Blocked by

- 04-transition-alert.md
