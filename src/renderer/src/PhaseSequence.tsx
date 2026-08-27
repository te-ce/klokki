import type { RunView } from '../../shared/timer'

/**
 * The phase list of one run, at its real proportions, with the
 * current phase filling up.
 *
 * The segment widths are the phases' configured minutes, so a 25/5 Pomodoro
 * reads as a long stretch and a short one rather than as two equal halves —
 * which is the only thing this bar is for. Both numbers are pushed: the fraction
 * is computed in the main process (see `phaseProgress`), so nothing here divides
 * one clock reading by another.
 */
export const PhaseSequence = ({ run }: { run: RunView }) => (
  <div className="flex h-1 gap-[3px]">
    {run.phases.map((phase, index) => (
      <div
        key={index}
        data-testid="phase-segment"
        style={{ flexGrow: phase.minutes }}
        className="bg-track flex overflow-hidden rounded-sm"
      >
        {index === run.phaseIndex ? (
          <div
            data-testid="phase-progress"
            style={{ width: `${run.phaseProgress * 100}%` }}
            className="bg-work"
          />
        ) : null}
      </div>
    ))}
  </div>
)
