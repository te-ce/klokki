import { useState } from 'react'
import { MS_PER_MINUTE } from '../../shared/preset'
import type { SportsView } from '../../shared/sport'
import { ADD_TIME_MS } from '../../shared/timer'
import { PlusIcon, SkipIcon, StopIcon } from './icons'

/** When the schedule next speaks, under the countdown it belongs to. */
const formatNextFire = (sports: SportsView): string => {
  if (sports.awaiting) return 'Waiting for you'
  if (sports.nextFireAt === null) return 'Not scheduled'
  return `Next at ${new Date(sports.nextFireAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`
}

/**
 * The live Sports countdown, shown only while the schedule is running —
 * laid out exactly like `TimerRunning`, for a single interval instead of a
 * phase sequence: what is running, the clock, what follows, then the
 * controls that act on it.
 */
export const SportsCountdown = ({ sports }: { sports: SportsView }) => {
  const [remainingInput, setRemainingInput] = useState('')

  return (
    <>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2" data-testid="sports-schedule">
          <span
            className={`size-1.75 rounded-full ${sports.awaiting ? 'bg-edge' : 'bg-work'}`}
          />
          <span className="text-ink-dim text-xs">Sports</span>
          <span className="text-edge">·</span>
          <span className="text-xs font-medium">
            every {sports.intervalMinutes}m
          </span>
          {sports.awaiting && (
            <span className="text-ink-faint text-[11px]">waiting for you</span>
          )}
        </div>

        <p
          data-testid="sports-countdown"
          className="font-mono text-[62px] leading-none font-light tracking-[-0.02em] tabular-nums"
        >
          {sports.countdown ?? '--:--'}
        </p>

        <p className="text-ink-faint mt-1 text-[11px] tabular-nums">
          {formatNextFire(sports)}
        </p>
      </div>

      <div className="flex gap-2">
        {/* Restarting is the tray's own move for a schedule already running:
            one full interval from now, so this doubles as the "skip to
            next" reset the countdown itself cannot offer. */}
        <button
          type="button"
          className="bg-ink text-ground flex h-7.5 items-center gap-1.5 rounded-[7px] px-3 font-medium"
          onClick={() => void window.klokki.startSports()}
        >
          <SkipIcon className="size-3.25" strokeWidth={2} />
          Restart
        </button>
        <button
          type="button"
          className="border-edge text-ink-soft hover:bg-panel flex h-7.5 items-center gap-1.5 rounded-[7px] border px-3"
          onClick={() => void window.klokki.addTimeSports(ADD_TIME_MS)}
        >
          <PlusIcon className="size-3.25" strokeWidth={2} />5 min
        </button>
        <button
          type="button"
          className="border-edge text-ink-soft hover:bg-panel flex h-7.5 items-center gap-1.5 rounded-[7px] border px-3"
          onClick={() => void window.klokki.stopSports()}
        >
          <StopIcon className="size-3.25" strokeWidth={2} />
          Stop
        </button>
      </div>

      {/* A waiting firing has no countdown to correct. */}
      <div
        hidden={sports.awaiting}
        className="bg-panel border-line flex flex-col gap-2 rounded-[9px] border p-3.5"
      >
        <p className="text-ink-dim text-[11px]">Set the remaining time.</p>
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
              void window.klokki.setRemainingSports(minutes * MS_PER_MINUTE)
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
