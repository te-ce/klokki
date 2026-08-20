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
