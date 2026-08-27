import { useEffect, useState } from 'react'
import { startLabel } from '../../shared/labels'
import type { TimerView } from '../../shared/timer'
import { PlayIcon } from './icons'
import { TimerIdle } from './TimerIdle'
import { TimerRunning } from './TimerRunning'
import { usePresets } from './usePresets'

/**
 * The whole view of the timers.
 *
 * There is no `setInterval` here and no arithmetic on `remainingMs`: the main
 * process owns the clock and pushes a formatted view every second (see
 * AGENTS.md). This component renders whatever last arrived, which is also why it
 * asks for the current view on mount instead of waiting for the next push.
 *
 * Several presets can run at once, so this draws one `TimerRunning` per run in
 * the order they were started — the same order the menubar title uses. "Nothing
 * running" is `runs.length === 0`, read off the one payload rather than pushed
 * as a second fact.
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

  const running = new Set(view.runs.map((run) => run.runId))

  return (
    <section className="flex flex-1 flex-col gap-5.5">
      {view.runs.length === 0 ? (
        <TimerIdle />
      ) : (
        view.runs.map((run) => <TimerRunning key={run.runId} run={run} />)
      )}

      {/* While something runs this sits at the foot of the pane, under the runs
          it adds to. With nothing running it is the only thing to do here, so it
          stays where the eye already is. */}
      <div
        className={`flex flex-col gap-2 ${view.runs.length > 0 ? 'mt-auto' : ''}`}
      >
        <h2 className="text-ink-faint text-[11px] tracking-[0.08em] uppercase">
          Start
        </h2>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="bg-panel border-edge hover:bg-raised flex h-7.5 items-center gap-1.75 rounded-[7px] border px-3"
              onClick={() => void window.klokki.startPreset(preset.id)}
            >
              {/* A preset with a run of its own is the one whose triangle is
                  lit, and the one whose button says Restart — the rest would each
                  add a run rather than replace this one. */}
              <PlayIcon
                className={
                  running.has(preset.id)
                    ? 'text-work size-3'
                    : 'text-ink-ghost size-3'
                }
              />
              {startLabel(preset.name, running.has(preset.id))}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
