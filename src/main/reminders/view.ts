import type { ReminderDefinition, ReminderView } from '../../shared/reminder'
import type { RemindersState } from './engine'

/**
 * Joins the saved reminder list with the engine's live schedule — the pure half
 * of what the settings window shows, so this is testable without the poll
 * timer or a file on disk. `nextFireAt` is null for a reminder the engine has
 * no running schedule for, which is true of a disabled one and momentarily true
 * of one just created.
 */
export const toReminderViews = (
  definitions: readonly ReminderDefinition[],
  state: RemindersState,
): readonly ReminderView[] =>
  definitions.map((definition) => ({
    ...definition,
    nextFireAt:
      state.find((run) => run.definitionId === definition.id)?.nextFireAt ??
      null,
  }))
