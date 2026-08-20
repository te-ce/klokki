/**
 * Wording that more than one window has to agree on.
 *
 * The menubar menu and the settings window both offer to start a preset, and a
 * user reading "Start Pomodoro" in one and "Restart Pomodoro" in the other would
 * be looking at the same button described two ways. One owner, so a rename lands
 * in both.
 */
export const startLabel = (name: string, running: boolean): string =>
  running ? `Restart ${name}` : `Start ${name}`

/**
 * What skipping the current phase does, named by what it starts.
 *
 * "Skip to Standing" says what the user gets; "Skip" alone reads like skipping
 * something they wanted. The last phase of a preset that does not loop has
 * nothing to name, and there it ends the run.
 */
export const skipLabel = (nextPhaseLabel: string | null): string =>
  nextPhaseLabel === null ? 'Skip to the end' : `Skip to ${nextPhaseLabel}`
