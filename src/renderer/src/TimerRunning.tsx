import { useState } from 'react'
import { skipLabel } from '../../shared/labels'
import { MS_PER_MINUTE } from '../../shared/preset'
import { ADD_TIME_MS } from '../../shared/timer'
import type { RunView } from '../../shared/timer'
import { PlusIcon, SkipIcon, StopIcon } from './icons'
import { PhaseSequence } from './PhaseSequence'

/** What follows the phase on screen, and whether the sequence starts over. */
const whatFollows = (run: RunView): string => {
  if (run.nextPhaseLabel === null) return 'Last phase'
  const next = `${run.nextPhaseLabel} ${run.nextPhaseMinutes}m`
  return run.loop ? `${next} · then repeat` : next
}

/**
 * One run: its phase, its countdown, its sequence bar, and the four things that
 * can be done to it.
 *
 * Every control names `run.runId`, because the pane draws one of these per
 * running preset and a command that meant "the timer" would land on whichever
 * run the main process happened to consider current.
 */
export const TimerRunning = ({ run }: { run: RunView }) => {
  const [remainingInput, setRemainingInput] = useState('')
  const phase = run.phases[run.phaseIndex]

  return (
    <>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2" data-testid="running-phase">
          <span
            className={`size-1.75 rounded-full ${run.awaiting ? 'bg-edge' : 'bg-work'}`}
          />
          <span className="text-ink-dim text-xs">{run.presetName}</span>
          <span className="text-edge">·</span>
          <span className="text-xs font-medium">{run.phaseLabel}</span>
          {/* A waiting run's countdown does not move, so the pane says why
              rather than leaving a frozen clock to be read as a stuck one. */}
          {run.awaiting && (
            <span className="text-ink-faint text-[11px]">waiting to start</span>
          )}
        </div>

        <p
          data-testid="countdown"
          className="font-mono text-[62px] leading-none font-light tracking-[-0.02em] tabular-nums"
        >
          {run.countdown}
        </p>

        <div className="mt-1 flex flex-col gap-1.5">
          <PhaseSequence run={run} />
          <div className="text-ink-faint flex justify-between text-[11px]">
            <span>
              {run.phaseLabel} {phase?.minutes}m
            </span>
            <span>{whatFollows(run)}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {/* Named by what it starts, the same wording the tray uses. The view
            carries the next phase's label because the renderer holds no phase
            list to look it up in. */}
        {/* At an unanswered boundary the phase named here has not started, so
            the button starts it. There is nothing to skip past: skipping and
            confirming are the same move, and only one of them is honest. */}
        <button
          type="button"
          className="bg-ink text-ground flex h-7.5 items-center gap-1.5 rounded-[7px] px-3 font-medium"
          onClick={() =>
            void (run.awaiting
              ? window.klokki.confirmNext(run.runId)
              : window.klokki.skipPhase(run.runId))
          }
        >
          <SkipIcon className="size-3.25" strokeWidth={2} />
          {run.awaiting
            ? `Start ${run.phaseLabel}`
            : skipLabel(run.nextPhaseLabel)}
        </button>
        <button
          type="button"
          className="border-edge text-ink-soft hover:bg-panel flex h-7.5 items-center gap-1.5 rounded-[7px] border px-3"
          onClick={() => void window.klokki.addTime(run.runId, ADD_TIME_MS)}
        >
          <PlusIcon className="size-3.25" strokeWidth={2} />5 min
        </button>
        <button
          type="button"
          className="border-edge text-ink-soft hover:bg-panel flex h-7.5 items-center gap-1.5 rounded-[7px] border px-3"
          onClick={() => void window.klokki.stopTimer(run.runId)}
        >
          <StopIcon className="size-3.25" strokeWidth={2} />
          Stop
        </button>
      </div>

      {/* For a timer started late: pulls it back in sync with the wall clock
          rather than leaving it running the length it was given. A waiting run
          has no remaining time to correct, so it is not offered one. */}
      <div
        hidden={run.awaiting}
        className="bg-panel border-line flex flex-col gap-2 rounded-[9px] border p-3.5"
      >
        <p className="text-ink-dim text-[11px]">
          Started late? Correct the remaining time.
        </p>
        <div className="flex items-center gap-2">
          <div className="bg-rail border-edge flex h-7 items-center rounded-md border pr-2.5">
            <input
              type="number"
              min={0}
              step={1}
              aria-label="Minutes remaining"
              value={remainingInput}
              onChange={(event) => setRemainingInput(event.target.value)}
              className="w-14 bg-transparent px-2.5 font-mono tabular-nums outline-none"
            />
            <span className="text-ink-ghost text-[11px]">min</span>
          </div>
          <button
            type="button"
            className="border-edge text-ink-soft hover:bg-panel flex h-7 items-center rounded-md border px-3 text-xs"
            onClick={() => {
              const minutes = Number(remainingInput)
              if (!Number.isFinite(minutes) || minutes < 0) return
              void window.klokki.setRemaining(
                run.runId,
                minutes * MS_PER_MINUTE,
              )
              setRemainingInput('')
            }}
          >
            Set remaining
          </button>
        </div>
      </div>
    </>
  )
}
