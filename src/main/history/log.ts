import {
  appendFileSync,
  closeSync,
  openSync,
  readSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'
import type { HistoryEvent, PhaseOutcome } from '../../shared/history'

export const HISTORY_FILE_NAME = 'history.jsonl'

/**
 * How much of the file's end a read looks at. Seven days of sit/stand is a few
 * hundred lines, so this covers the whole scope of the stats view (see AGENTS.md)
 * without the file's total size ever entering the picture.
 */
const DEFAULT_TAIL_BYTES = 256 * 1024

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isOutcome = (value: unknown): value is PhaseOutcome =>
  value === 'completed' || value === 'snoozed' || value === 'skipped'

/**
 * Every line is untrusted: the last one may be half-written (a process killed
 * mid-append), and the file is as hand-editable as presets.json.
 */
const decodeLine = (line: string): HistoryEvent | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }

  if (
    !isRecord(parsed) ||
    typeof parsed.endedAt !== 'number' ||
    typeof parsed.presetId !== 'string' ||
    typeof parsed.phaseLabel !== 'string' ||
    typeof parsed.durationMs !== 'number' ||
    !isOutcome(parsed.outcome)
  )
    return null

  return {
    endedAt: parsed.endedAt,
    presetId: parsed.presetId,
    phaseLabel: parsed.phaseLabel,
    durationMs: parsed.durationMs,
    outcome: parsed.outcome,
  }
}

/**
 * The last `maxBytes` of the file as whole lines.
 *
 * Reading the tail rather than the file means the log can grow forever without
 * the stats view getting slower. A window that starts mid-line leaves a fragment
 * at the front, which is dropped — the same fragment `decodeLine` would refuse
 * anyway, dropped here so it cannot be mistaken for a corrupt entry.
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
 * The append-only record of ended phases.
 *
 * Append-only is the whole design: a kill mid-write can only corrupt the line
 * being written, never an earlier day, and a reader that skips undecodable lines
 * turns that corruption into one missing phase instead of a broken app.
 */
export type HistoryLog = {
  readonly append: (event: HistoryEvent) => void
  /** Newest last. `maxBytes` bounds how much of the file's end is parsed. */
  readonly readRecent: (maxBytes?: number) => readonly HistoryEvent[]
}

export const createHistoryLog = (dir: string): HistoryLog => {
  const path = join(dir, HISTORY_FILE_NAME)

  return {
    append: (event) => {
      // Best-effort, like the preset file: an unwritable disk must not take the
      // timer down, and a lost line costs the user one row of statistics.
      try {
        appendFileSync(path, `${JSON.stringify(event)}\n`, 'utf8')
      } catch {
        /* empty */
      }
    },
    readRecent: (maxBytes = DEFAULT_TAIL_BYTES) =>
      readTailLines(path, maxBytes)
        .map(decodeLine)
        .filter((event): event is HistoryEvent => event !== null),
  }
}
