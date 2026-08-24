import type { HistoryEvent, HistoryStats } from '../../shared/history'
import type {
  ReminderHistoryEvent,
  ReminderHistoryStats,
} from '../../shared/reminder-history'
import type {
  SportsHistoryEvent,
  SportsHistoryStats,
} from '../../shared/sports-history'
import { systemClock, type Clock } from '../timer/clock'
import { createHistoryLog } from './log'
import { createReminderHistoryLog } from './reminder-log'
import { summariseReminders } from './reminder-stats'
import { createSportsHistoryLog } from './sports-log'
import { summariseSports } from './sports-stats'
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

/**
 * The reminder counterpart to `History` — same log-plus-summary shape, same
 * reason the clock is injected, over the reminder log instead of the phase one.
 */
export type ReminderHistory = {
  readonly append: (event: ReminderHistoryEvent) => void
  readonly stats: () => ReminderHistoryStats
  readonly subscribe: (listener: () => void) => () => void
}

export const createReminderHistory = (
  dir: string,
  clock: Clock = systemClock,
  timeZone?: string,
): ReminderHistory => {
  const log = createReminderHistoryLog(dir)
  const listeners = new Set<() => void>()

  return {
    append: (event) => {
      log.append(event)
      for (const listener of listeners) listener()
    },
    stats: () => summariseReminders(log.readRecent(), clock.now(), timeZone),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/**
 * The Sports counterpart to `ReminderHistory` — same log-plus-summary shape,
 * over the Sports log instead of the reminder one.
 */
export type SportsHistory = {
  readonly append: (event: SportsHistoryEvent) => void
  readonly stats: () => SportsHistoryStats
  readonly subscribe: (listener: () => void) => () => void
}

export const createSportsHistory = (
  dir: string,
  clock: Clock = systemClock,
  timeZone?: string,
): SportsHistory => {
  const log = createSportsHistoryLog(dir)
  const listeners = new Set<() => void>()

  return {
    append: (event) => {
      log.append(event)
      for (const listener of listeners) listener()
    },
    stats: () => summariseSports(log.readRecent(), clock.now(), timeZone),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
