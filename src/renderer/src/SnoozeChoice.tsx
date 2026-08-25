import { MS_PER_MINUTE } from '../../shared/preset'

/**
 * "Later" is one decision, so it is one control: a labelled segment strip
 * rather than a button per increment. Three buttons reading
 * "Snooze 5 minutes" ran ~390px wide inside a 380px overlay, which is what
 * wrapped the Sports overlay's footer onto two lines and pushed its content
 * past the window (see AGENTS.md — the overlay is sized to its content, and
 * content that wraps has no height the main process can predict).
 *
 * Each segment is still a button named "Snooze n minutes" — the visible glyph
 * is the number alone, and the label the strip carries is what makes it read.
 * The accessible name is the full sentence, because "10" on its own names
 * nothing out of context.
 */
export const SnoozeChoice = ({
  options,
  onSnooze,
}: {
  readonly options: readonly number[]
  readonly onSnooze: (extraMs: number) => void
}) => (
  <div className="border-edge flex h-9 items-stretch overflow-hidden rounded-lg border">
    <span className="text-ink-faint border-edge flex items-center border-r px-2.5 text-xs">
      Snooze
    </span>
    {options.map((minutes, index) => (
      <button
        key={minutes}
        type="button"
        aria-label={`Snooze ${minutes} minutes`}
        className={`text-ink-soft hover:bg-panel border-line flex items-center px-2.5 tabular-nums ${
          index === 0 ? '' : 'border-l'
        }`}
        onClick={() => onSnooze(minutes * MS_PER_MINUTE)}
      >
        {minutes}
      </button>
    ))}
  </div>
)
