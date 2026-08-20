import { useEffect, useRef, useState } from 'react'
import type { Preset } from '../../shared/preset'

/**
 * The saved preset list, kept fresh by the main process.
 *
 * The list has one owner, and it is not here (see AGENTS.md): a window that reads
 * it once on mount shows whatever was true when it opened, which is wrong the
 * moment anything — this window, another window, or the tray — changes it. Reading
 * once and then subscribing is the same shape the timer view uses, and for the
 * same reason: a window that has just opened must not be blank while it waits for
 * the first push.
 */
export const usePresets = (): readonly Preset[] => {
  const [presets, setPresets] = useState<readonly Preset[]>([])
  const pushed = useRef(false)

  useEffect(() => {
    let cancelled = false
    // Subscribed before the first read, so a save landing in between is not lost.
    // A push always wins over the read it raced, including an empty one — the user
    // deleting their last preset is a list, not a missing answer.
    const unsubscribe = window.klokki.onPresets((next) => {
      pushed.current = true
      setPresets(next)
    })

    void window.klokki.listPresets().then((next) => {
      if (!cancelled && !pushed.current) setPresets(next)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return presets
}
