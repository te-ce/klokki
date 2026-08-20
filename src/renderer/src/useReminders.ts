import { useEffect, useRef, useState } from 'react'
import type { ReminderView } from '../../shared/reminder'

/**
 * The saved reminder list, kept fresh by the main process — the reminder
 * counterpart to `usePresets`, and for the same reason (see AGENTS.md): reading
 * once and then subscribing is what keeps a window that has just opened from
 * being blank while it waits for the first push, and a push always wins over
 * the read it raced.
 */
export const useReminders = (): readonly ReminderView[] => {
  const [reminders, setReminders] = useState<readonly ReminderView[]>([])
  const pushed = useRef(false)

  useEffect(() => {
    let cancelled = false
    const unsubscribe = window.klokki.onReminders((next) => {
      pushed.current = true
      setReminders(next)
    })

    void window.klokki.listReminders().then((next) => {
      if (!cancelled && !pushed.current) setReminders(next)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return reminders
}
