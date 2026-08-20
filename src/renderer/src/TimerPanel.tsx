import { useEffect, useState } from 'react'
import { startLabel } from '../../shared/labels'
import type { TimerView } from '../../shared/timer'
import { PlayIcon } from './icons'
import { TimerIdle } from './TimerIdle'
import { TimerRunning } from './TimerRunning'
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
    <section className="flex flex-1 flex-col gap-5.5">
      {view.running ? <TimerRunning view={view} /> : <TimerIdle />}

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
