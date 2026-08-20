import { useState } from 'react'
import { skipLabel } from '../../shared/labels'
import { MS_PER_MINUTE } from '../../shared/preset'
import { ADD_TIME_MS } from '../../shared/timer'
import type { TimerView } from '../../shared/timer'
import { PlusIcon, SkipIcon, StopIcon } from './icons'
import { PhaseSequence } from './PhaseSequence'

/** What follows the phase on screen, and whether the sequence starts over. */
const whatFollows = (view: TimerView): string => {
  if (view.nextPhaseLabel === null) return 'Last phase'
  const next = `${view.nextPhaseLabel} ${view.nextPhaseMinutes}m`
  return view.loop ? `${next} · then repeat` : next
}

export const TimerRunning = ({ view }: { view: TimerView }) => {
  const [remainingInput, setRemainingInput] = useState('')
  const phase = view.phases[view.phaseIndex]

  return (
    <>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2" data-testid="running-phase">
          <span className="bg-work size-1.75 rounded-full" />
          <span className="text-ink-dim text-xs">{view.presetName}</span>
          <span className="text-edge">·</span>
          <span className="text-xs font-medium">{view.phaseLabel}</span>
        </div>

        <p
          data-testid="countdown"
          className="font-mono text-[62px] leading-none font-light tracking-[-0.02em] tabular-nums"
        >
          {view.countdown}
        </p>

        <div className="mt-1 flex flex-col gap-1.5">
          <PhaseSequence view={view} />
          <div className="text-ink-faint flex justify-between text-[11px]">
            <span>
              {view.phaseLabel} {phase?.minutes}m
            </span>
            <span>{whatFollows(view)}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {/* Named by what it starts, the same wording the tray uses. The view
            carries the next phase's label because the renderer holds no phase
            list to look it up in. */}
        <button
          type="button"
          className="bg-ink text-ground flex h-7.5 items-center gap-1.5 rounded-[7px] px-3 font-medium"
          onClick={() => void window.klokki.skipPhase()}
        >
          <SkipIcon className="size-3.25" strokeWidth={2} />
          {skipLabel(view.nextPhaseLabel)}
        </button>
        <button
          type="button"
          className="border-edge text-ink-soft hover:bg-panel flex h-7.5 items-center gap-1.5 rounded-[7px] border px-3"
          onClick={() => void window.klokki.addTime(ADD_TIME_MS)}
        >
          <PlusIcon className="size-3.25" strokeWidth={2} />5 min
        </button>
        <button
          type="button"
          className="border-edge text-ink-soft hover:bg-panel flex h-7.5 items-center gap-1.5 rounded-[7px] border px-3"
          onClick={() => void window.klokki.stopTimer()}
        >
          <StopIcon className="size-3.25" strokeWidth={2} />
          Stop
        </button>
      </div>

      {/* For a timer started late: pulls it back in sync with the wall clock
          rather than leaving it running the length it was given. */}
      <div className="bg-panel border-line flex flex-col gap-2 rounded-[9px] border p-3.5">
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
              void window.klokki.setRemaining(minutes * MS_PER_MINUTE)
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
