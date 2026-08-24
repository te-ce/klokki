import {
  appendFileSync,
  closeSync,
  openSync,
  readSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'
import type { SportsHistoryEvent } from '../../shared/sports-history'

export const SPORTS_HISTORY_FILE_NAME = 'sports-history.jsonl'

/** Same budget as the phase log (`log.ts`): stats only ever ask for seven days. */
const DEFAULT_TAIL_BYTES = 256 * 1024

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Every line is untrusted: the last one may be half-written (a process killed
 * mid-append), and the file is as hand-editable as sports.json.
 */
const decodeLine = (line: string): SportsHistoryEvent | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }

  if (
    !isRecord(parsed) ||
    typeof parsed.loggedAt !== 'number' ||
    typeof parsed.activityId !== 'string' ||
    typeof parsed.activityLabel !== 'string' ||
    typeof parsed.quantity !== 'number'
  )
    return null

  return {
    loggedAt: parsed.loggedAt,
    activityId: parsed.activityId,
    activityLabel: parsed.activityLabel,
    quantity: parsed.quantity,
  }
}

/** The last `maxBytes` of the file as whole lines. See `log.ts`'s `readTailLines`. */
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
 * The append-only record of logged Sports activity — the Sports counterpart
 * to `ReminderHistoryLog`, same durability guarantees for the same reason.
 */
export type SportsHistoryLog = {
  readonly append: (event: SportsHistoryEvent) => void
  /** Newest last. `maxBytes` bounds how much of the file's end is parsed. */
  readonly readRecent: (maxBytes?: number) => readonly SportsHistoryEvent[]
}

export const createSportsHistoryLog = (dir: string): SportsHistoryLog => {
  const path = join(dir, SPORTS_HISTORY_FILE_NAME)

  return {
    append: (event) => {
      try {
        appendFileSync(path, `${JSON.stringify(event)}\n`, 'utf8')
      } catch {
        /* empty */
      }
    },
    readRecent: (maxBytes = DEFAULT_TAIL_BYTES) =>
      readTailLines(path, maxBytes)
        .map(decodeLine)
        .filter((event): event is SportsHistoryEvent => event !== null),
  }
}
