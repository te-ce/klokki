/**
 * Sports is one interval schedule that asks about every activity at once,
 * rather than a reminder's cycling steps — see AGENTS.md and the Sports
 * feature plan. It ships with defaults (situps, squats, pushups) instead of
 * starting empty like reminders, because the request is a routine the app
 * already knows, not one the user has to invent first.
 */

import { isRecord } from './preset'

export type SportActivity = {
  readonly id: string
  readonly name: string
}

export type SportSettings = {
  readonly intervalMinutes: number
  readonly activities: readonly SportActivity[]
  readonly enabled: boolean
}

/**
 * The settings plus when Sports next fires — the Sports counterpart to
 * `ReminderView`. There is only ever one, so this has no id.
 */
export type SportsView = SportSettings & {
  readonly nextFireAt: number | null
  readonly awaiting: boolean
}

export const isSportActivity = (value: unknown): value is SportActivity =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string'

export const isSportSettings = (value: unknown): value is SportSettings =>
  isRecord(value) &&
  typeof value.intervalMinutes === 'number' &&
  typeof value.enabled === 'boolean' &&
  Array.isArray(value.activities) &&
  value.activities.every(isSportActivity)

/**
 * Settings with no activities, or an interval of zero, would fire forever
 * with nothing to ask about — the Sports counterpart to `isRunnableReminder`.
 */
export const isRunnableSportSettings = (settings: SportSettings): boolean =>
  settings.activities.length > 0 && settings.intervalMinutes > 0

const sameActivity = (a: SportActivity, b: SportActivity): boolean =>
  a.id === b.id && a.name === b.name

/** The Sports counterpart to `sameReminder` — the editor's dirty-check. */
export const sameSportSettings = (
  a: SportSettings,
  b: SportSettings,
): boolean =>
  a.intervalMinutes === b.intervalMinutes &&
  a.enabled === b.enabled &&
  a.activities.length === b.activities.length &&
  a.activities.every((activity, index) => {
    const other = b.activities[index]
    return other !== undefined && sameActivity(activity, other)
  })

/** Why the user cannot save these settings, in the order the form should show it. */
export const validateSportSettings = (
  settings: SportSettings,
): readonly string[] => {
  const problems: string[] = []

  if (settings.activities.length === 0)
    problems.push('Sports needs at least one activity.')
  if (!(settings.intervalMinutes > 0))
    problems.push('Sports needs an interval longer than zero minutes.')

  settings.activities.forEach((activity, index) => {
    if (activity.name.trim() === '')
      problems.push(`Activity ${index + 1} needs a name.`)
  })

  return problems
}
