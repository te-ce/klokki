import type { SportSettings, SportsView } from '../../shared/sport'
import { systemClock, type Clock } from '../timer/clock'
import type { SportRunState } from './engine'
import { toSportsView } from './view'

type ViewStoreSource = {
  readonly get: () => SportSettings
  readonly subscribe: (
    listener: (settings: SportSettings) => void,
  ) => () => void
}

type ViewServiceSource = {
  readonly getState: () => SportRunState
  readonly onScheduleChange: (listener: () => void) => () => void
}

export type SportsViewSource = {
  readonly view: () => SportsView
  readonly subscribe: (listener: (view: SportsView) => void) => () => void
  readonly dispose: () => void
}

/**
 * The Sports settings joined with the engine's live schedule, re-read on
 * every store save and every schedule change — the one view there is.
 */
export const createSportsViewSource = (
  store: ViewStoreSource,
  service: ViewServiceSource,
  clock: Clock = systemClock,
): SportsViewSource => {
  const view = (): SportsView =>
    toSportsView(store.get(), service.getState(), clock.now())

  const listeners = new Set<(view: SportsView) => void>()
  let announced: string | null = null

  const emit = (): void => {
    const current = view()
    const key = JSON.stringify(current)
    if (key === announced) return
    announced = key
    for (const listener of listeners) listener(current)
  }

  const unsubscribeStore = store.subscribe(emit)
  const unsubscribeService = service.onScheduleChange(emit)

  return {
    view,
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
