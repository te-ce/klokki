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
}

export const createHistory = (
  dir: string,
  clock: Clock = systemClock,
  timeZone?: string,
): History => {
  const log = createHistoryLog(dir)

  return {
    append: (event) => log.append(event),
    stats: () => summarise(log.readRecent(), clock.now(), timeZone),
  }
}
