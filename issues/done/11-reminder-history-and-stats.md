# Reminder history and stats

**Type:** AFK

## What to build

Reminder events don't fit the phase `history.jsonl` schema — no `presetId`, no
`durationMs`, and a quantity that schema has no field for — so they get their
own append-only log, `reminders-history.jsonl`, one line per answered reminder:
`{ loggedAt, reminderId, stepLabel, quantity, outcome }`, `outcome` is
`'done' | 'snoozed'`, `quantity` is null for a unit-less step. Same append-only,
tail-read, tolerate-a-truncated-last-line rules as the existing history log —
this is the same durability problem solved the same way, just a different shape.

The Stats pane gets a Reminders section using the same today + last-7-days
shape as the existing phase stats: today's total quantity per step label (e.g.
"pushups: 60, squats: 40"), then the same total per day for the last 7 days. A
day with nothing logged renders empty, not missing.

## Acceptance criteria

- [x] Every Done and Snooze answer from 09 appends one `reminders-history.jsonl`
      line
- [x] The log is append-only, survives relaunches, and a truncated final line is
      skipped without failing the read
- [x] Stats pane shows today's total quantity per step label
- [x] Stats pane shows the last 7 days per step label, reading only the log's
      tail
- [x] A day with no reminder activity renders empty rather than erroring
- [x] Unit tests cover append, tail-read, the malformed-line case and day-bucket
      arithmetic against a fixed clock, mirroring `stats.test.ts`

## Blocked by

- 08-reminder-engine-and-persistence.md
- 09-reminder-popup-and-snooze.md
