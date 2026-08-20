# Transition alert: notification + acknowledged overlay

**Type:** AFK

## What to build

Make a phase change impossible to miss. When a phase ends, Klokki posts a native
notification _and_ shows a borderless always-on-top overlay naming the phase that
just finished and the one starting now. The overlay stays until the user
acknowledges it.

The notification alone is deliberately not enough: it is silently swallowed by Do
Not Disturb and by fullscreen apps, which are exactly the situations where a
"stand up" nudge matters most. That is the whole reason the overlay exists, so
the platform configuration is the substance of this slice — the overlay has to
appear above fullscreen windows and on whichever Space is active, not politely
wait on the Space where it was created.

Only phases with `notify` set raise an alert. The app stays a menubar app
throughout: the overlay must not put Klokki in the Dock or the app switcher, and
must not steal keyboard focus from what the user was typing in.

One trap to handle explicitly: timing is wall-clock, so the first tick after a
long sleep can drain many phases at once. That must produce one alert for where
the timer actually is, not a burst of stale notifications for phases that elapsed
while the lid was shut.

## Acceptance criteria

- [x] A phase ending with `notify` set posts a native notification naming the
      next phase
- [x] A phase ending with `notify` unset raises no notification and no overlay
- [x] The overlay appears above a fullscreen app and on the currently active
      Space
- [x] The overlay does not appear in the Dock or the app switcher, and does not
      take keyboard focus from the frontmost app
- [x] The overlay stays until the user dismisses it; it does not auto-close on a
      timer
- [x] Waking after several phases have elapsed produces exactly one alert, for
      the current phase — not one per elapsed phase
- [x] An e2e test asserts the overlay window exists after a transition, and is
      gone after dismissal

## Blocked by

- 02-live-timer-state-in-settings-window.md
