import { useEffect, useState } from 'react'
import { skipLabel, startLabel } from '../../shared/labels'
import { MS_PER_MINUTE } from '../../shared/preset'
import type { TimerView } from '../../shared/timer'
import { usePresets } from './usePresets'

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
  const [remainingInput, setRemainingInput] = useState('')
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
    <section className="flex flex-col gap-6">
      {view.running ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-neutral-400">
            {view.presetName} — {view.phaseLabel}
          </p>
          <p
            data-testid="countdown"
            className="font-mono text-6xl tabular-nums"
          >
            {view.countdown}
          </p>
          <div className="mt-4 flex gap-2">
            {/* Named by what it starts, the same wording the tray uses. The
                view carries the next phase's label because the renderer holds
                no phase list to look it up in. */}
            <button
              type="button"
              className="rounded bg-neutral-700 px-3 py-1 text-sm"
              onClick={() => void window.klokki.skipPhase()}
            >
              {skipLabel(view.nextPhaseLabel)}
            </button>
            <button
              type="button"
              className="rounded bg-neutral-700 px-3 py-1 text-sm"
              onClick={() => void window.klokki.stopTimer()}
            >
              Stop
            </button>
          </div>
          {/* For a timer started late: pulls it back in sync with the wall
              clock rather than leaving it running the length it was given. */}
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={1}
              value={remainingInput}
              onChange={(event) => setRemainingInput(event.target.value)}
              placeholder="minutes remaining"
              className="w-32 rounded bg-neutral-800 px-2 py-1 text-sm"
            />
            <button
              type="button"
              className="rounded bg-neutral-700 px-3 py-1 text-sm"
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
      ) : (
        <p className="text-neutral-400">Nothing running.</p>
      )}

      <div className="flex flex-col items-start gap-2">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="rounded bg-neutral-700 px-3 py-1 text-sm"
            onClick={() => void window.klokki.startPreset(preset.id)}
          >
            {startLabel(preset.name, view.running)}
          </button>
        ))}
      </div>
    </section>
  )
}
