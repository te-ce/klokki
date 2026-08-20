import type { TimerService } from '../timer/service'
import type { PresetStore } from './store'

/**
 * Starting is by id, not by preset object: a renderer only ever holds what came
 * across IPC, and an unknown id is a no-op rather than an error — the preset may
 * have been deleted under an open window.
 *
 * The store is read at the moment of the start, so a preset edited since launch
 * runs in its saved form. A run already in progress keeps the phases it started
 * with; the timer holds that snapshot until it is restarted (see AGENTS.md).
 */
export const startPresetById = (
  service: TimerService,
  store: PresetStore,
  id: string,
): void => {
  const preset = store.list().find((candidate) => candidate.id === id)
  if (preset) service.startPreset(preset)
}
