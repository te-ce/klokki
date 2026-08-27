/**
 * The third way out of an alert: end the thing that raised it.
 *
 * An alert is where the user is standing when they decide they are done for the
 * day, and until now the only answers it took were "later" and "yes" — so
 * stopping meant finding the tray while an overlay sat over it. It is on all
 * three overlays for the same reason the footer is: a user who has learnt one
 * has learnt all three.
 *
 * It is deliberately the quietest control in the window and the furthest from
 * the affirmative — text where Done is filled, and at the opposite end of the
 * footer — because it is the one answer that cannot be taken back by waiting.
 * The visible glyph is "Stop"; what is stopped is in the accessible name, the
 * same split `SnoozeChoice` makes with its increments, because a wider button
 * is what pushed this footer past the window in the first place.
 */
export const OverlayStop = ({
  label,
  onStop,
}: {
  /** What is being stopped: "Stop timer", "Stop reminder", "Stop Sports". */
  readonly label: string
  readonly onStop: () => void
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    className="text-ink-faint hover:bg-panel hover:text-ink h-9 shrink-0 rounded-lg px-2.5 text-xs"
    onClick={onStop}
  >
    Stop
  </button>
)
