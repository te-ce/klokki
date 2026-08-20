import type { Preset } from './preset'

/** Seeded presets. Users may edit or add their own; these are just defaults. */
export const SEED_PRESETS: readonly Preset[] = [
  {
    id: 'pomodoro',
    name: 'Pomodoro',
    loop: true,
    phases: [
      { label: 'Focus', minutes: 25, notify: true },
      { label: 'Break', minutes: 5, notify: true },
    ],
  },
  {
    id: 'sit-stand',
    name: 'Sit / Stand',
    loop: true,
    phases: [
      { label: 'Sitting', minutes: 30, notify: true },
      { label: 'Standing', minutes: 15, notify: true },
    ],
  },
]
