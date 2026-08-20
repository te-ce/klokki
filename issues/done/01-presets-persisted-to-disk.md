# Presets persisted to disk, tray menu reflects them

**Type:** AFK

## What to build

Move the source of presets from the hardcoded `SEED_PRESETS` constant to a
`presets.json` file in the app's user-data directory, owned and written by the
main process. On first run the file does not exist, so it is created from the
seeds. On every later run the timer and the tray menu are driven by whatever is
on disk.

The file carries a `schemaVersion` from the start, so a future format change has
somewhere to hook. A file that cannot be read or parsed must not take the app
down — a menubar timer that fails to launch because of one bad byte is worse
than one that falls back to the seeded presets and says so.

No UI in this slice: presets are still only startable from the tray menu. The
slice is complete when editing `presets.json` by hand and relaunching changes
what the tray offers.

## Acceptance criteria

- [x] First launch with no `presets.json` writes one containing the Pomodoro and
      Sit / Stand seeds, and the tray menu lists both
- [x] Presets added or renamed by hand-editing the file appear in the tray menu
      on next launch
- [x] A preset with an empty phase list or a zero-minute phase is rejected at
      load and does not appear as startable (the machine assumes progress)
- [x] A malformed or unreadable `presets.json` falls back to the seeded presets
      and the app still launches
- [x] The written file carries a `schemaVersion` field
- [x] Unit tests cover the round trip, the malformed-file fallback and the
      invalid-preset rejection, without touching the real user-data directory

## Blocked by

None - can start immediately
