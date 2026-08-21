import type { ReminderService } from './service'
import type { ReminderStore } from './store'

/**
 * Starting a reminder is by id, the same as starting a preset: the tray and a
 * renderer both hold only what they were pushed, and an unknown id is a no-op
 * rather than an error — the reminder may have been deleted under an open menu.
 *
 * A start does two things, because a reminder can be off *and* unscheduled: it
 * enables the definition — which is what makes the engine keep it — and then
 * schedules it one full interval from now, so starting one that was already
 * running restarts its interval rather than doing nothing. That is the same
 * promise "Restart Pomodoro" makes in the same menu.
 */
export const startReminderById = (
  store: ReminderStore,
  service: ReminderService,
  id: string,
): void => {
  const definition = store.list().find((candidate) => candidate.id === id)
  if (!definition) return

  if (!definition.enabled) store.setEnabled(id, true)
  service.start(id)
}
