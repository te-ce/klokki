import type { TimerView } from '../../shared/timer'

/**
 * The phase list of the running preset, at its real proportions, with the
 * current phase filling up.
 *
 * The segment widths are the phases' configured minutes, so a 25/5 Pomodoro
 * reads as a long stretch and a short one rather than as two equal halves —
 * which is the only thing this bar is for. Both numbers are pushed: the fraction
 * is computed in the main process (see `phaseProgress`), so nothing here divides
 * one clock reading by another.
 */
export const PhaseSequence = ({ view }: { view: TimerView }) => (
  <div className="flex h-1 gap-[3px]">
    {view.phases.map((phase, index) => (
      <div
        key={index}
        data-testid="phase-segment"
        style={{ flexGrow: phase.minutes }}
        className="bg-track flex overflow-hidden rounded-sm"
      >
        {index === view.phaseIndex ? (
          <div
            data-testid="phase-progress"
            style={{ width: `${view.phaseProgress * 100}%` }}
            className="bg-work"
          />
        ) : null}
      </div>
    ))}
  </div>
)
