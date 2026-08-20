import {
  appendFileSync,
  closeSync,
  openSync,
  readSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'
import type {
  ReminderHistoryEvent,
  ReminderOutcome,
} from '../../shared/reminder-history'

export const REMINDER_HISTORY_FILE_NAME = 'reminders-history.jsonl'

/**
 * Same budget as the phase log (`log.ts`): the stats view only ever asks for
 * seven days, so the file's total size never enters the picture.
 */
const DEFAULT_TAIL_BYTES = 256 * 1024

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isOutcome = (value: unknown): value is ReminderOutcome =>
  value === 'done' || value === 'snoozed'

/**
 * Every line is untrusted: the last one may be half-written (a process killed
 * mid-append), and the file is as hand-editable as reminders.json.
 */
const decodeLine = (line: string): ReminderHistoryEvent | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }

  if (
    !isRecord(parsed) ||
    typeof parsed.loggedAt !== 'number' ||
    typeof parsed.reminderId !== 'string' ||
    typeof parsed.stepLabel !== 'string' ||
    (parsed.quantity !== null && typeof parsed.quantity !== 'number') ||
    !isOutcome(parsed.outcome)
  )
    return null

  return {
    loggedAt: parsed.loggedAt,
    reminderId: parsed.reminderId,
    stepLabel: parsed.stepLabel,
    quantity: parsed.quantity,
    outcome: parsed.outcome,
  }
}

/**
 * The last `maxBytes` of the file as whole lines. See `log.ts`'s
 * `readTailLines` — the same reasoning applies unchanged to this file.
 */
const readTailLines = (path: string, maxBytes: number): readonly string[] => {
  let fd: number
  let size: number
  try {
    size = statSync(path).size
    fd = openSync(path, 'r')
  } catch {
    return []
  }

  const length = Math.min(size, maxBytes)
  const start = size - length
  const buffer = Buffer.alloc(length)
  try {
    readSync(fd, buffer, 0, length, start)
  } catch {
    return []
  } finally {
    closeSync(fd)
  }

  const text = buffer.toString('utf8')
  const lines = text.split('\n')
  if (start > 0) lines.shift()
  return lines.filter((line) => line.trim() !== '')
}

/**
 * The append-only record of answered reminder steps — the reminder
 * counterpart to `HistoryLog`, same durability guarantees for the same reason.
 */
export type ReminderHistoryLog = {
  readonly append: (event: ReminderHistoryEvent) => void
  /** Newest last. `maxBytes` bounds how much of the file's end is parsed. */
  readonly readRecent: (maxBytes?: number) => readonly ReminderHistoryEvent[]
}

export const createReminderHistoryLog = (dir: string): ReminderHistoryLog => {
  const path = join(dir, REMINDER_HISTORY_FILE_NAME)

  return {
    append: (event) => {
      // Best-effort, like the phase log: an unwritable disk must not take the
      // reminder engine down, and a lost line costs the user one row of stats.
      try {
        appendFileSync(path, `${JSON.stringify(event)}\n`, 'utf8')
      } catch {
        /* empty */
      }
    },
    readRecent: (maxBytes = DEFAULT_TAIL_BYTES) =>
      readTailLines(path, maxBytes)
        .map(decodeLine)
        .filter((event): event is ReminderHistoryEvent => event !== null),
  }
}
