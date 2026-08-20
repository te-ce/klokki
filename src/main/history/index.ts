import type { HistoryEvent, HistoryStats } from '../../shared/history'
import { systemClock, type Clock } from '../timer/clock'
import { createHistoryLog } from './log'
import { summarise } from './stats'

/**
 * The main process's view of what has already happened: the append-only log plus
 * the summary the stats window asks for. The clock is injected for the same
 * reason it is in the timer — the day boundary is logic, not a wait.
 */
export type History = {
  readonly append: (event: HistoryEvent) => void
  /** Derived on demand from the log's tail; nothing is cached to go stale. */
  readonly stats: () => HistoryStats
  /**
   * Fires once per line written, after it is written.
   *
   * The moment a stretch is recorded is the only moment the stats can change, and
   * this is the module that knows it. Anything downstream that instead watches
   * the timer has to guess — and guesses wrong on a snooze, and on two phases
   * that share a label.
   */
  readonly subscribe: (listener: () => void) => () => void
}

export const createHistory = (
  dir: string,
  clock: Clock = systemClock,
  timeZone?: string,
): History => {
  const log = createHistoryLog(dir)
  const listeners = new Set<() => void>()

  return {
    append: (event) => {
      log.append(event)
      for (const listener of listeners) listener()
    },
    stats: () => summarise(log.readRecent(), clock.now(), timeZone),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
