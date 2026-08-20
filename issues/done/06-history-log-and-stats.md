# History log + today / last-7-days stats

**Type:** AFK

## What to build

Record what actually happened and show it back. Every phase that ends appends one
line to `history.jsonl` in the user-data directory: when it ended, which preset
and phase, how long, and whether it completed or was snoozed. Append-only, one
line per event — a process killed mid-write can corrupt at most the last line,
never an earlier day.

The settings window gets a stats view over that log: today first (phases
completed, minutes per phase label — the sitting-versus-standing number is the
point), then the last seven days. Seven days is deliberately the whole scope,
because it is a tail-read of the file and needs no query engine; anything wider
would mean loading everything into memory or adopting a database.

Reading must tolerate the file's own failure mode: a truncated final line is
skipped, not fatal.

## Acceptance criteria

- [x] Each ended phase appends exactly one JSONL line with timestamp, preset id,
      phase label, duration and outcome (completed or snoozed)
- [x] The log survives relaunches and is never rewritten in place
- [x] A truncated or malformed final line is skipped; the stats still render and
      the app still launches
- [x] The stats view shows today's completed phases and minutes per phase label
- [x] The stats view shows the last 7 days, and reads only the tail of the file
      rather than parsing all of it
- [x] A day with no recorded phases renders as empty rather than missing or
      erroring
- [x] Unit tests cover append, tail-read, the malformed-line case and the
      day-boundary arithmetic against a fixed clock

## Blocked by

- 01-presets-persisted-to-disk.md
- 02-live-timer-state-in-settings-window.md
