import { useEffect, useState } from 'react'
import { skipLabel, startLabel } from '../../shared/labels'
import { MS_PER_MINUTE } from '../../shared/preset'
import type { TimerView } from '../../shared/timer'
import { MarkIcon, PlayIcon, SkipIcon, StopIcon } from './icons'
import { usePresets } from './usePresets'

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
const PhaseSequence = ({ view }: { view: TimerView }) => (
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

/** What follows the phase on screen, and whether the sequence starts over. */
const whatFollows = (view: TimerView): string => {
  if (view.nextPhaseLabel === null) return 'Last phase'
  const next = `${view.nextPhaseLabel} ${view.nextPhaseMinutes}m`
  return view.loop ? `${next} · then repeat` : next
}

const Running = ({ view }: { view: TimerView }) => {
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

const Idle = () => (
  <div className="flex flex-col items-start gap-3 py-6">
    <MarkIcon className="text-edge size-8" />
    <p className="text-ink-dim">Nothing running.</p>
  </div>
)

/**
 * The whole view of the running timer.
 *
 * There is no `setInterval` here and no arithmetic on `remainingMs`: the main
 * process owns the clock and pushes a formatted view every second (see
 * AGENTS.md). This component renders whatever last arrived, which is also why it
 * asks for the current view on mount instead of waiting for the next push.
 */
export const TimerPanel = () => {
  const [view, setView] = useState<TimerView | null>(null)
  const presets = usePresets()

  useEffect(() => {
    let cancelled = false
    // Subscribe before the first read, so an update landing in between is not
    // lost — it just overwrites the snapshot with something newer.
    const unsubscribe = window.klokki.onTimerView(setView)

    void window.klokki.getTimerView().then((current) => {
      if (!cancelled) setView((latest) => latest ?? current)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  if (!view) return null

  return (
    <section className="flex flex-1 flex-col gap-5.5">
      {view.running ? <Running view={view} /> : <Idle />}

      {/* While a timer runs this sits at the foot of the pane, under the phase it
          would replace. With nothing running it is the only thing to do here, so
          it stays where the eye already is. */}
      <div className={`flex flex-col gap-2 ${view.running ? 'mt-auto' : ''}`}>
        <h2 className="text-ink-faint text-[11px] tracking-[0.08em] uppercase">
          {view.running ? 'Restart with' : 'Start'}
        </h2>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="bg-panel border-edge hover:bg-raised flex h-7.5 items-center gap-1.75 rounded-[7px] border px-3"
              onClick={() => void window.klokki.startPreset(preset.id)}
            >
              {/* The running preset is the one whose triangle is lit; the rest
                  are offered, not playing. */}
              <PlayIcon
                className={
                  view.running && preset.name === view.presetName
                    ? 'text-work size-3'
                    : 'text-ink-ghost size-3'
                }
              />
              {startLabel(preset.name, view.running)}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
