import type { ReminderDefinition, ReminderView } from '../../shared/reminder'
import type { RemindersState } from './engine'
import { toReminderViews } from './view'

/** The slice of the reminder store the view source needs. */
type ViewStoreSource = {
  readonly list: () => readonly ReminderDefinition[]
  readonly subscribe: (
    listener: (reminders: readonly ReminderDefinition[]) => void,
  ) => () => void
}

/** The slice of the reminder service the view source needs. */
type ViewServiceSource = {
  readonly getState: () => RemindersState
  /**
   * Every change to the schedule, not just the firings: a reminder answered
   * five minutes late gets its next interval from the answer, and a window
   * that only heard about firings would still be showing "waiting for you".
   */
  readonly onScheduleChange: (listener: () => void) => () => void
}

export type ReminderViewSource = {
  /** The joined list a window sees, read fresh — `wireApp`'s old `reminderViews`. */
  readonly views: () => readonly ReminderView[]
  readonly subscribe: (
    listener: (views: readonly ReminderView[]) => void,
  ) => () => void
  readonly dispose: () => void
}

/**
 * The reminder list a window sees: the store's definitions joined with the
 * engine's live schedule, re-read on every store save and every change to that
 * schedule. The reminder counterpart to `TimerService` and `PresetStore` —
 * a real port `wireApp` only has to pass to `BroadcastSources`, rather than
 * a join and a listener set it holds itself.
 */
export const createReminderViewSource = (
  store: ViewStoreSource,
  service: ViewServiceSource,
): ReminderViewSource => {
  const views = (): readonly ReminderView[] =>
    toReminderViews(store.list(), service.getState())

  const listeners = new Set<(views: readonly ReminderView[]) => void>()
  // One save reaches this twice — once as the store's edit, once as the change
  // it made to the schedule — and both times the list is the same list. A window
  // is told when it differs, so the same push does not arrive twice.
  let announced: string | null = null

  const emit = (): void => {
    const current = views()
    const key = JSON.stringify(current)
    if (key === announced) return
    announced = key
    for (const listener of listeners) listener(current)
  }

  const unsubscribeStore = store.subscribe(emit)
  const unsubscribeService = service.onScheduleChange(emit)

  return {
    views,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose: () => {
      unsubscribeStore()
      unsubscribeService()
      listeners.clear()
    },
  }
}
