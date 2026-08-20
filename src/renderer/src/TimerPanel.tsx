import { useEffect, useState } from 'react'
import { startLabel } from '../../shared/labels'
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
          <button
            type="button"
            className="mt-4 self-start rounded bg-neutral-700 px-3 py-1 text-sm"
            onClick={() => void window.klokki.stopTimer()}
          >
            Stop
          </button>
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
