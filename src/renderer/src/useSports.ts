import { useEffect, useRef, useState } from 'react'
import type { SportsView } from '../../shared/sport'

const IDLE_SPORTS_VIEW: SportsView = {
  intervalMinutes: 60,
  activities: [],
  enabled: false,
  nextFireAt: null,
  awaiting: false,
  remainingMs: null,
  countdown: null,
}

/**
 * The Sports settings joined with its live schedule, kept fresh by the main
 * process — the Sports counterpart to `useReminders`: read once, then
 * subscribe, so a window that has just opened is never blank while it waits
 * for the first push.
 */
export const useSports = (): SportsView => {
  const [sports, setSports] = useState<SportsView>(IDLE_SPORTS_VIEW)
  const pushed = useRef(false)

  useEffect(() => {
    let cancelled = false
    const unsubscribe = window.klokki.onSports((next) => {
      pushed.current = true
      setSports(next)
    })

    void window.klokki.getSportsSettings().then((next) => {
      if (!cancelled && !pushed.current) setSports(next)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return sports
}
